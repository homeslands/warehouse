// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Platform, ScrollView, StyleSheet, TextInput, type ScrollViewInstance } from 'react-native'
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native'

import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { stopDraftPersistence, useReceiveDraft } from '@/features/receive-checklist'
import {
  makeDraft,
  makeForm,
  makeItem,
  makeLine,
} from '@/features/receive-checklist/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { chooseAction, confirmAction } from '@/shared/lib/native-confirm'
import { pressSheetCancel, pressSheetDone, sheetHeader } from '@/shared/ui/testing/sheet-header'

import { ReceiveLineSheetScreen } from './ReceiveLineSheetScreen'

const fontOf = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as never)?.fontFamily
const mockSetParams = jest.fn()
const mockBack = jest.fn()
const mockParams: { key?: string; compose?: string; focus?: string } = {}
/**
 * `usePreventRemove` giả (như `ExportLineSheetScreen.test.tsx`): ghi lại sheet có đang chặn rời không và
 * hàm xử lý lần rời bị chặn — `swipeDown()` mô phỏng vuốt xuống / back Android.
 */
const mockGuard: {
  prevent: boolean
  onBlocked: ((e: { repeat: () => void }) => void) | null
} = { prevent: false, onBlocked: null }
jest.mock('expo-router', () => ({
  useRouter: () => ({ setParams: mockSetParams, back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  usePreventRemove: (prevent: boolean, onBlocked: (e: { repeat: () => void }) => void) => {
    mockGuard.prevent = prevent
    mockGuard.onBlocked = onBlocked
    return jest.fn()
  },
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native')
  return {
    __esModule: true,
    default: (props: object) => <View testID="date-picker" {...props} />,
    DateTimePickerAndroid: { open: jest.fn() },
  }
})

jest.mock('@/shared/lib/native-confirm', () => ({
  confirmAction: jest.fn(),
  chooseAction: jest.fn(),
}))
const mockConfirm = confirmAction as jest.MockedFunction<typeof confirmAction>

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const FORM_URL = '/warehouses/wh-a/import-forms/pn-1'
const FORM_DATE = '2026-11-04'

const SON = 'm-1|u-1'
const KEEP = 'm-3|u-3'
let client: QueryClient

function seed(over: { checkedOthers?: boolean } = {}) {
  const lines = [
    makeLine(1, {
      materialName: 'Sơn Dulux',
      materialCode: 'SON1',
      unitName: 'thùng',
      unitPrice: 1200000,
      quantity: 6,
      base: { quantity: 6, expiryDate: null, note: null },
    }),
    makeLine(2, { checked: true }),
    makeLine(3, { checked: over.checkedOthers ?? false }),
  ]
  useReceiveDraft.setState({
    ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'pn-1' },
    draft: makeDraft(lines, { header: { ...makeDraft([]).header, date: FORM_DATE } }),
  })
}

function signIn(scope: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope, warehouses: [WH] } as never,
  })
}
/** Checklist (xác nhận được) + sửa được: mặc định của file. */
const EDIT = ['IMPORT_FORM_READ', 'IMPORT_FORM_UPDATE_DRAFT', 'IMPORT_FORM_CONFIRM']
/** "Sửa phiếu": sửa được, không xác nhận được. */
const SUPERVISOR = ['IMPORT_FORM_READ', 'IMPORT_FORM_UPDATE_DRAFT']

async function show() {
  route('get', FORM_URL, () => ok(makeForm([makeItem(1)], { date: FORM_DATE })))
  const view = await render(
    <QueryClientProvider client={client}>
      <ReceiveLineSheetScreen />
    </QueryClientProvider>,
  )
  await act(async () => {
    for (let n = 0; n < 5; n++) await new Promise((r) => setTimeout(r, 0))
  })
  return view
}
const qty = () => screen.getByLabelText('Thực nhận')
const line = (key: string) => useReceiveDraft.getState().draft?.lines.find((l) => l.key === key)
const type = (text: string) => fireEvent.changeText(qty(), text)
const save = () =>
  fireEvent.press(screen.getByRole('button', { name: 'Lưu · sang dòng chưa kiểm tiếp' }))

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(async () => {
  jest.clearAllMocks()
  resetFakeApi()
  await AsyncStorage.clear()
  useReceiveDraft.getState().reset()
  mockParams.key = SON
  delete mockParams.compose
  delete mockParams.focus
  mockGuard.prevent = false
  mockGuard.onBlocked = null
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
  signIn(EDIT)
  seed()
})

afterEach(() => {
  stopDraftPersistence()
  useReceiveDraft.getState().reset()
  client.clear()
})

describe('ReceiveLineSheetScreen — bảng sửa dòng', () => {
  it('checklist mode unchanged', async () => {
    // Sheet kiểu Apple chỉ cho `compose=1`; checklist giữ bố cục cũ: Phiếu ghi / Thực nhận / Lưu · sang dòng.
    await show()
    expect(screen.getByText('Phiếu ghi')).toBeOnTheScreen()
    expect(qty()).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Lưu · sang dòng chưa kiểm tiếp' })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Hạn dùng, chưa có' })).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Tăng' })).toBeNull()
    expect(screen.queryByLabelText(/^Số lượng/)).toBeNull()
    expect(screen.queryByLabelText('Đơn giá')).toBeNull()
    expect(screen.queryByText('Thành tiền')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Xoá/ })).toBeNull()
    // Không có chặn "Bỏ thay đổi?": ✕ đóng ngay kể cả khi đã gõ.
    await type('5')
    expect(mockGuard.prevent).toBe(false)
    await pressSheetCancel()
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(line(SON)).toMatchObject({ quantity: 6, checked: false })
  })

  it('mở dòng Sơn: tiêu đề = tên vật tư, "Phiếu ghi" chỉ đọc, "Thực nhận" focus với giá trị 6', async () => {
    await show()
    expect(sheetHeader().title).toBe('Sơn Dulux')
    expect(screen.getByText(/^SON1 · 1\.200\.000\sđ\/thùng$/)).toBeOnTheScreen()
    expect(screen.getByText('Phiếu ghi')).toBeOnTheScreen()
    expect(qty().props.value).toBe('6')
    expect(qty().props.autoFocus).toBe(true)
    expect(qty().props.keyboardType).toBe('decimal-pad')
    expect(qty().props.selectTextOnFocus).toBe(true)
    expect(screen.queryByText(/so với phiếu|Thừa|Không nhận/)).toBeNull()
  })

  it('mã vật tư dùng font code; chữ + đơn giá và ô ghi chú KHÔNG dùng font code', async () => {
    await show()
    expect(fontOf(screen.getByText('SON1'))).toBe('ui-monospace')
    expect(fontOf(screen.getByText(/^SON1 · 1\.200\.000\sđ\/thùng$/))).toBeUndefined()
  })

  it('gõ 5 → "Thiếu 1 thùng so với phiếu"; 6,5 → "Thừa 0,5 thùng"; 0 → "Không nhận, sẽ bỏ khỏi phiếu"', async () => {
    await show()
    await type('5')
    expect(screen.getByText('Thiếu 1 thùng so với phiếu')).toBeOnTheScreen()
    await type('6,5')
    expect(screen.getByText('Thừa 0,5 thùng')).toBeOnTheScreen()
    await type('0')
    expect(screen.getByText('Không nhận, sẽ bỏ khỏi phiếu')).toBeOnTheScreen()
  })

  it('số lẻ quá 6 chữ số → lỗi dưới ô và Lưu không ghi', async () => {
    await show()
    await type('1,2345678')
    expect(screen.getByText('Tối đa 6 chữ số thập phân')).toBeOnTheScreen()
    await save()
    expect(line(SON)?.quantity).toBe(6)
    expect(line(SON)?.checked).toBe(false)
    expect(mockSetParams).not.toHaveBeenCalled()
    await type('abc')
    expect(screen.getByText('Nhập số lượng hợp lệ (số không âm)')).toBeOnTheScreen()
  })

  it('Lưu: ghi quantity 5 + đã kiểm rồi sang dòng chưa kiểm kế tiếp (bỏ qua dòng đã kiểm)', async () => {
    await show()
    await type('5')
    await save()
    expect(line(SON)).toMatchObject({ quantity: 5, checked: true })
    expect(mockSetParams).toHaveBeenCalledWith({ key: KEEP })
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('không còn dòng chưa kiểm → Lưu đóng sheet; ✓ trên header lưu và đóng', async () => {
    seed({ checkedOthers: true })
    await show()
    await save()
    expect(line(SON)?.checked).toBe(true)
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockSetParams).not.toHaveBeenCalled()
  })

  it('✓ trên header: lưu rồi đóng, không sang dòng khác', async () => {
    await show()
    await type('4')
    await pressSheetDone()
    expect(line(SON)).toMatchObject({ quantity: 4, checked: true })
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockSetParams).not.toHaveBeenCalled()
  })

  it('sang dòng chưa kiểm kế tiếp theo thứ tự, vòng về đầu khi hết phía sau', async () => {
    const lines = [
      makeLine(1, { checked: false }),
      makeLine(2, { checked: true }),
      makeLine(3, { checked: true }),
    ]
    useReceiveDraft.setState({ draft: makeDraft(lines) })
    mockParams.key = 'm-3|u-3'
    await show()
    await save()
    expect(mockSetParams).toHaveBeenCalledWith({ key: 'm-1|u-1' })
  })

  it('key không có trong bản nháp → đóng sheet', async () => {
    mockParams.key = 'khong-co'
    await show()
    expect(mockBack).toHaveBeenCalled()
  })

  it('hạn dùng: minimumDate = ngày phiếu (giờ máy); chọn hợp lệ ghi YYYY-MM-DD giờ máy; "Xoá hạn" bỏ hạn', async () => {
    await show()
    expect(screen.queryByTestId('date-picker')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: /^Hạn dùng/ }))
    const picker = screen.getByTestId('date-picker')
    expect(picker.props.minimumDate).toEqual(new Date(2026, 10, 4))
    expect(picker.props.mode).toBe('date')
    expect(screen.getByRole('button', { name: 'Hạn dùng, chưa có' }).props.accessibilityHint).toBe(
      'Chạm để chọn ngày',
    )
    // 23:30 giờ máy: không được lệch sang ngày khác như khi đi qua UTC.
    await fireEvent(picker, 'valueChange', { nativeEvent: {} }, new Date(2026, 11, 31, 23, 30))
    expect(screen.queryByTestId('date-picker')).toBeNull()
    await save()
    expect(line(SON)?.expiryDate).toBe('2026-12-31')
    expect(screen.getByRole('button', { name: 'Hạn dùng, 31/12/2026' })).toBeOnTheScreen()
  })

  it('"Xoá hạn" bỏ hạn dùng đang có', async () => {
    useReceiveDraft.setState({
      draft: makeDraft([makeLine(1, { expiryDate: '2027-01-01' }), makeLine(2)]),
    })
    await show()
    expect(screen.getByText('01/01/2027')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá hạn' }))
    await save()
    expect(line(SON)?.expiryDate).toBeNull()
  })

  it('hạn trước ngày phiếu bị chặn trên máy: báo lỗi, không đổi hạn', async () => {
    await show()
    await fireEvent.press(screen.getByRole('button', { name: /^Hạn dùng/ }))
    await fireEvent(
      screen.getByTestId('date-picker'),
      'valueChange',
      { nativeEvent: {} },
      new Date(2026, 10, 3),
    )
    expect(screen.getByText('Hạn dùng không được trước ngày nhập của phiếu.')).toBeOnTheScreen()
    await save()
    expect(line(SON)?.expiryDate).toBeNull()
  })

  it('ghi chú được lưu cùng dòng', async () => {
    await show()
    await fireEvent.changeText(screen.getByLabelText('Ghi chú'), 'Móp 1 thùng')
    await save()
    expect(line(SON)?.note).toBe('Móp 1 thùng')
  })

  it('xác nhận được, không có quyền sửa → không có ô nhập; chỉ "Đánh dấu đã kiểm", không đổi giá trị', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CONFIRM'])
    await show()
    expect(screen.queryByLabelText('Thực nhận')).toBeNull()
    expect(screen.getByLabelText('Phiếu ghi, 6 thùng')).toBeOnTheScreen()
    expect(screen.getByLabelText('Thực nhận, 6 thùng')).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Lưu · sang dòng chưa kiểm tiếp' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Hạn dùng/ })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Đánh dấu đã kiểm' }))
    expect(line(SON)).toMatchObject({ quantity: 6, checked: true })
    expect(mockSetParams).toHaveBeenCalledWith({ key: KEEP })
  })

  it('đang Lưu / Xác nhận → chỉ đọc: không ô nhập, không ✓, nút khoá, không ghi gì', async () => {
    useReceiveDraft.getState().setSaving(true)
    await show()
    const before = useReceiveDraft.getState().draft
    expect(screen.queryByLabelText('Thực nhận')).toBeNull()
    expect(screen.getByLabelText('Thực nhận, 6 thùng')).toBeOnTheScreen()
    expect(screen.getByText('Đang lưu phiếu — chờ lưu xong rồi sửa tiếp.')).toBeOnTheScreen()
    expect(sheetHeader().done).toBeUndefined()
    const mark = screen.getByRole('button', { name: 'Đánh dấu đã kiểm' })
    expect(mark).toBeDisabled()
    await fireEvent.press(mark)
    expect(useReceiveDraft.getState().draft).toBe(before)
    expect(mockSetParams).not.toHaveBeenCalled()
    // Lưu xong → sửa lại được.
    await act(async () => useReceiveDraft.getState().setSaving(false))
    expect(qty()).toBeOnTheScreen()
  })
})

describe('ReceiveLineSheetScreen — sửa được, không xác nhận được, không compose (mở thẳng route)', () => {
  beforeEach(() => signIn(SUPERVISOR))

  // Người chỉ sửa được luôn sửa ở màn soạn (`compose=1`); không còn chế độ "Sửa phiếu" của checklist.
  it('chỉ xem như "view": không ô nhập, không ✓, không nút đánh dấu / sang dòng, không ghi gì', async () => {
    await show()
    expect(screen.queryByLabelText('Thực nhận')).toBeNull()
    expect(screen.getByLabelText('Thực nhận, 6 thùng')).toBeOnTheScreen()
    expect(sheetHeader().done).toBeUndefined()
    expect(screen.queryByRole('button', { name: 'Đánh dấu đã kiểm' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lưu · sang dòng chưa kiểm tiếp' })).toBeNull()
    expect(screen.queryByText(/chỉ đánh dấu/)).toBeNull()
    expect(line(SON)?.quantity).toBe(6)
  })
})

describe('ReceiveLineSheetScreen — chưa biết quyền trên phiếu (tải phiếu lỗi)', () => {
  it('như trước: câu "chỉ đánh dấu được" + nút "Đánh dấu đã kiểm" (chỉ chế độ sửa đã rõ mới ẩn)', async () => {
    route('get', FORM_URL, () => failure(500, 100001))
    await render(
      <QueryClientProvider client={client}>
        <ReceiveLineSheetScreen />
      </QueryClientProvider>,
    )
    await act(async () => {
      for (let n = 0; n < 5; n++) await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByLabelText('Thực nhận')).toBeNull()
    expect(screen.getByText(/chỉ đánh dấu đã kiểm được/)).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Đánh dấu đã kiểm' })).toBeOnTheScreen()
  })
})

describe('ReceiveLineSheetScreen — không sửa, không xác nhận', () => {
  it('chỉ xem: không ô nhập, không ✓, không "Đánh dấu đã kiểm", không câu "chỉ đánh dấu được"', async () => {
    signIn(['IMPORT_FORM_READ'])
    await show()
    expect(screen.queryByLabelText('Thực nhận')).toBeNull()
    expect(screen.getByLabelText('Thực nhận, 6 thùng')).toBeOnTheScreen()
    expect(sheetHeader().done).toBeUndefined()
    expect(screen.queryByRole('button', { name: 'Đánh dấu đã kiểm' })).toBeNull()
    expect(screen.queryByText(/chỉ đánh dấu/)).toBeNull()
  })
})

describe('ReceiveLineSheetScreen — chế độ soạn (compose=1), sheet sửa dòng kiểu Apple', () => {
  const UNITS = [
    { unitSlug: 'u-1', unitCode: 'T', unitName: 'thùng', conversionRate: 1, isBaseUnit: true },
    { unitSlug: 'u-x', unitCode: 'B', unitName: 'bao', conversionRate: 10, isBaseUnit: false },
  ]
  const AV = '/warehouses/wh-a/import-forms/available-materials'
  const DISCARD = 'Bỏ thay đổi?'
  function seedCompose(extra: ReturnType<typeof makeLine>[] = [makeLine(2)]) {
    const lines = [
      makeLine(1, {
        materialName: 'Sơn Dulux',
        materialCode: 'SON1',
        unitName: 'thùng',
        unitPrice: 1200000,
        quantity: 6,
        units: UNITS,
        base: { quantity: 6, expiryDate: null, note: null },
      }),
      ...extra,
    ]
    useReceiveDraft.setState({
      ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'pn-1' },
      draft: makeDraft(lines, { header: { ...makeDraft([]).header, date: FORM_DATE } }),
    })
  }
  const qtyField = () => screen.getByTestId('import-line-sheet-qty')
  const priceField = () => screen.getByLabelText('Đơn giá')
  const noteField = () => screen.getByLabelText('Ghi chú')
  const button = (name: string | RegExp) => screen.getByRole('button', { name })
  const amount = () =>
    screen.getByLabelText(/^Thành tiền, /).props.accessibilityLabel.replace('Thành tiền, ', '')
  const addExpiry = () => button('Thêm hạn')
  const clearExpiry = () => button('Xoá hạn')
  const unitChip = (unit = 'thùng') => button(`Đơn vị ${unit}, chạm để đổi`)
  const confirmTitles = () => mockConfirm.mock.calls.map((c) => c[0].title)
  async function swipeDown() {
    await act(async () => {
      if (mockGuard.prevent) mockGuard.onBlocked!({ repeat: () => mockBack() })
      else mockBack()
    })
  }
  /** Đếm lần ghi (zustand chép hàm sang mỗi state mới → bọc qua setState rồi trả lại). */
  function countWrites() {
    const original = useReceiveDraft.getState().updateLine
    const calls: Parameters<typeof original>[] = []
    useReceiveDraft.setState({
      updateLine: (...args) => {
        calls.push(args)
        return original(...args)
      },
    })
    return { calls, restore: () => useReceiveDraft.setState({ updateLine: original }) }
  }

  beforeEach(() => {
    mockParams.compose = '1'
    mockConfirm.mockResolvedValue(true)
    jest.mocked(chooseAction).mockResolvedValue(null)
    seedCompose()
  })

  it('bố cục: tiêu đề = tên, thẻ Số lượng (chip đơn vị + stepper to), Đơn giá + Thành tiền, HSD / Ghi chú / Xoá', async () => {
    await show()
    expect(sheetHeader().title).toBe('Sơn Dulux')
    expect(qtyField().props.value).toBe('6')
    expect(qtyField().props.keyboardType).toBe('decimal-pad')
    expect(button('Tăng')).toHaveStyle({ width: 47, height: 32 })
    expect(qtyField()).toHaveStyle({ fontSize: 17, minWidth: 64 })
    expect(unitChip()).toBeOnTheScreen()
    expect(priceField().props.value).toBe('1.200.000')
    expect(screen.getByText('đ / thùng')).toBeOnTheScreen()
    expect(amount()).toBe('7.200.000 đ')
    // HSD tuỳ chọn, chưa có → nhãn + chữ accent "Thêm hạn" (không có viên chọn ngày, không có ✕).
    expect(screen.getByText('Hạn dùng')).toBeOnTheScreen()
    expect(addExpiry()).toBeOnTheScreen()
    expect(screen.queryByTestId('date-picker')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Xoá hạn' })).toBeNull()
    expect(screen.getByText('Nếu nhiều hạn, nhập hạn sớm nhất')).toBeOnTheScreen()
    expect(noteField()).toBeOnTheScreen()
    expect(button('Xoá khỏi phiếu')).toBeOnTheScreen()
    // Không phần kiểm hàng.
    expect(screen.queryByText('Phiếu ghi')).toBeNull()
    expect(screen.queryByLabelText('Thực nhận')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lưu · sang dòng chưa kiểm tiếp' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Đánh dấu đã kiểm' })).toBeNull()
    // Ô số không tự focus (bàn phím không che sheet khi mở).
    expect(qtyField().props.autoFocus).toBeFalsy()
  })

  it('nhãn "Đơn giá" hiện trên dòng không phải phần tử a11y riêng (VoiceOver không đọc hai lần)', async () => {
    await show()
    const label = screen.getByText('Đơn giá')
    expect(label.props.accessible).toBe(false)
    expect(label.props.importantForAccessibility).toBe('no')
    expect(screen.getAllByLabelText('Đơn giá')).toHaveLength(1)
  })

  it('compose: ✓ writes once with check:false and closes', async () => {
    useReceiveDraft.getState().updateLine(SON, {}, { check: true })
    expect(line(SON)?.checked).toBe(true)
    await show()
    const writes = countWrites()
    try {
      await fireEvent.changeText(qtyField(), '8')
      await fireEvent.changeText(priceField(), '1250000')
      await fireEvent.changeText(noteField(), 'Móp 1 thùng')
      // Gõ không ghi gì.
      expect(writes.calls).toHaveLength(0)
      expect(line(SON)).toMatchObject({ quantity: 6, unitPrice: 1200000, note: null })
      await pressSheetDone()
      expect(writes.calls).toHaveLength(1)
      expect(writes.calls[0]![0]).toBe(SON)
      expect(writes.calls[0]![1]).toEqual(
        expect.objectContaining({ quantity: 8, unitPrice: 1250000, note: 'Móp 1 thùng' }),
      )
      expect(writes.calls[0]![2]).toEqual({ check: false })
    } finally {
      writes.restore()
    }
    // Dấu đã kiểm của checklist giữ nguyên.
    expect(line(SON)).toMatchObject({ quantity: 8, unitPrice: 1250000, checked: true })
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('empty price saves 0', async () => {
    await show()
    await fireEvent.changeText(priceField(), '')
    expect(amount()).toBe('0 đ')
    await pressSheetDone()
    expect(line(SON)).toMatchObject({ quantity: 6, unitPrice: 0, checked: false })
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('thiếu số vẫn lưu: số trống = 0 "chưa nhập"; thành tiền "—"', async () => {
    await show()
    await fireEvent.changeText(qtyField(), '')
    expect(amount()).toBe('—')
    await pressSheetDone()
    expect(line(SON)?.quantity).toBe(0)
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['abc', 'Nhập số lượng hợp lệ (số không âm)'],
    ['1,2345678', 'Tối đa 6 chữ số thập phân'],
    ['1000000000000', 'Số lượng quá lớn'],
  ])('số lượng "%s" → ✓ báo lỗi tại ô, không ghi, không đóng', async (text, message) => {
    await show()
    await fireEvent.changeText(qtyField(), text)
    expect(screen.queryByText(message)).toBeNull()
    await pressSheetDone()
    expect(screen.getByText(message)).toBeOnTheScreen()
    expect(line(SON)?.quantity).toBe(6)
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('đơn giá 3 số lẻ / quá lớn → ✓ báo lỗi, không ghi; sửa lại thì ghi được', async () => {
    await show()
    await fireEvent.changeText(priceField(), '1,234')
    expect(priceField().props.value).toBe('1,234')
    await pressSheetDone()
    expect(screen.getByText('Đơn giá phải ≥ 0, tối đa 2 chữ số thập phân')).toBeOnTheScreen()
    await fireEvent.changeText(priceField(), '99999999999999999')
    await pressSheetDone()
    expect(screen.getByText('Đơn giá quá lớn')).toBeOnTheScreen()
    expect(line(SON)?.unitPrice).toBe(1200000)
    expect(mockBack).not.toHaveBeenCalled()
    await fireEvent.changeText(priceField(), '1,23')
    await pressSheetDone()
    expect(line(SON)?.unitPrice).toBe(1.23)
  })

  it('giá ngăn nghìn khi gõ; thành tiền tính ngay theo chữ đang gõ', async () => {
    await show()
    await fireEvent.changeText(priceField(), '1250000')
    expect(priceField().props.value).toBe('1.250.000')
    expect(amount()).toBe('7.500.000 đ')
    await fireEvent.changeText(qtyField(), '2')
    expect(amount()).toBe('2.500.000 đ')
    // vi: "." gõ theo thói quen là dấu nhóm.
    await fireEvent.changeText(priceField(), '1.250')
    expect(amount()).toBe('2.500 đ')
  })

  describe('stepper', () => {
    afterEach(() => jest.useRealTimers())

    it('+/− và giữ để lặp chỉ đổi chữ trong sheet; ✓ mới ghi', async () => {
      await show()
      jest.useFakeTimers()
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      await user.press(button('Tăng'))
      expect(qtyField().props.value).toBe('7')
      await user.press(button('Giảm'))
      await user.press(button('Giảm'))
      expect(qtyField().props.value).toBe('5')
      await user.longPress(button('Tăng'), { duration: 1000 })
      const held = Number(qtyField().props.value)
      expect(held).toBeGreaterThanOrEqual(9)
      expect(line(SON)?.quantity).toBe(6)
      jest.useRealTimers()
      await pressSheetDone()
      expect(line(SON)).toMatchObject({ quantity: held, checked: false })
    })

    it('− ở số ≤ 1 hỏi xoá dòng: không → giữ; đồng ý → bỏ dòng và đóng', async () => {
      await show()
      await fireEvent.changeText(qtyField(), '1')
      mockConfirm.mockResolvedValueOnce(false)
      await fireEvent.press(button('Giảm'))
      expect(confirmTitles()).toEqual(['Xoá Sơn Dulux khỏi phiếu?'])
      expect(line(SON)).toBeDefined()
      expect(mockBack).not.toHaveBeenCalled()
      await fireEvent.press(button('Giảm'))
      await act(async () => undefined)
      expect(line(SON)).toBeUndefined()
      expect(mockBack).toHaveBeenCalledTimes(1)
      expect(confirmTitles()).not.toContain(DISCARD)
    })

    it('chữ không đọc được: "−" không hỏi xoá, bắt đầu lại từ 0 như "+"; ô không tô cam "thiếu"', async () => {
      await show()
      await fireEvent.changeText(qtyField(), '1,2,3')
      expect(qtyField().props.placeholder).toBeUndefined()
      await fireEvent.press(button('Giảm'))
      expect(mockConfirm).not.toHaveBeenCalled()
      expect(qtyField().props.value).toBe('')
      await fireEvent.changeText(qtyField(), 'abc')
      await fireEvent.press(button('Tăng'))
      expect(qtyField().props.value).toBe('1')
    })
  })

  it('đổi đơn vị qua chip (action sheet gốc) = updateLine tại chỗ khi ✓, khoá đổi, đóng MỘT lần', async () => {
    await show()
    jest.mocked(chooseAction).mockResolvedValueOnce(1)
    await fireEvent.press(unitChip())
    expect(jest.mocked(chooseAction).mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        title: 'Sơn Dulux',
        actions: [{ label: 'thùng (đang chọn)' }, { label: 'bao (10 thùng)' }],
      }),
    )
    expect(unitChip('bao')).toBeOnTheScreen()
    expect(screen.getByText('đ / bao')).toBeOnTheScreen()
    expect(line(SON)?.unitSlug).toBe('u-1')
    await pressSheetDone()
    expect(line('m-1|u-x')).toMatchObject({
      unitSlug: 'u-x',
      unitName: 'bao',
      units: UNITS,
      checked: false,
    })
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('chú thích tỉ lệ dưới nhóm Số lượng: chỉ khi đơn vị không phải gốc', async () => {
    await show()
    expect(screen.queryByText(/^1 .* = /)).toBeNull()
    jest.mocked(chooseAction).mockResolvedValueOnce(1)
    await fireEvent.press(unitChip())
    expect(screen.getByText('1 bao = 10 thùng · 6 bao = 60 thùng')).toBeOnTheScreen()
    await fireEvent.changeText(qtyField(), '')
    expect(screen.getByText('1 bao = 10 thùng')).toBeOnTheScreen()
    jest.mocked(chooseAction).mockResolvedValueOnce(0)
    await fireEvent.press(unitChip('bao'))
    expect(screen.queryByText(/^1 .* = /)).toBeNull()
  })

  it('đổi đơn vị trùng dòng khác → lỗi tại thẻ, không ghi, không đóng; chọn lại thì hết lỗi', async () => {
    seedCompose([
      makeLine(1, { key: 'm-1|u-x', unitSlug: 'u-x', unitName: 'bao', units: UNITS, base: null }),
    ])
    await show()
    jest.mocked(chooseAction).mockResolvedValueOnce(1)
    await fireEvent.press(unitChip())
    await pressSheetDone()
    expect(screen.getByText(/Đã có dòng đơn vị này/)).toBeOnTheScreen()
    expect(line(SON)?.unitSlug).toBe('u-1')
    expect(mockBack).not.toHaveBeenCalled()
    jest.mocked(chooseAction).mockResolvedValueOnce(0)
    await fireEvent.press(unitChip('bao'))
    expect(screen.queryByText(/Đã có dòng đơn vị này/)).toBeNull()
    await pressSheetDone()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('dòng server chưa có snapshot đơn vị (có IMPORT_FORM_CREATE) → tải đơn vị, chip mở được', async () => {
    signIn([...EDIT, 'IMPORT_FORM_CREATE'])
    const l = { ...useReceiveDraft.getState().draft!.lines[0]!, units: undefined }
    useReceiveDraft.setState({ draft: makeDraft([l]) })
    route('get', AV, () =>
      ok({
        items: [
          { slug: 'm-1', code: 'SON1', name: 'Sơn', quantity: 0, suppliers: [], units: UNITS },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
        hasNext: false,
      }),
    )
    await show()
    await fireEvent.press(unitChip())
    expect(jest.mocked(chooseAction).mock.calls[0]![0].actions).toEqual([
      { label: 'thùng (đang chọn)' },
      { label: 'bao (10 thùng)' },
    ])
  })

  it('tải đơn vị lỗi → chip là chữ + câu lỗi', async () => {
    signIn([...EDIT, 'IMPORT_FORM_CREATE'])
    const l = { ...useReceiveDraft.getState().draft!.lines[0]!, units: undefined }
    useReceiveDraft.setState({ draft: makeDraft([l]) })
    route('get', AV, () => failure(500, 100001))
    await show()
    expect(screen.getByText('Không tải được đơn vị của vật tư')).toBeOnTheScreen()
  })

  it('compose without IMPORT_FORM_CREATE: line with no units snapshot → only its current unit, no request', async () => {
    const l = { ...useReceiveDraft.getState().draft!.lines[0]!, units: undefined }
    useReceiveDraft.setState({ draft: makeDraft([l]) })
    route('get', AV, () => ({ status: 403 }))
    await show()
    expect(callsTo('get', AV)).toHaveLength(0)
    expect(screen.getByText('thùng')).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: /^Đơn vị / })).toBeNull()
    expect(screen.queryByText('Không tải được đơn vị của vật tư')).toBeNull()
  })

  it('Android, hơn 3 đơn vị: chip bung danh sách đơn vị ngay trong sheet', async () => {
    const MORE = [
      ...UNITS,
      { unitSlug: 'u-k', unitCode: 'K', unitName: 'kg', conversionRate: 2, isBaseUnit: false },
      { unitSlug: 'u-l', unitCode: 'L', unitName: 'lốc', conversionRate: 6, isBaseUnit: false },
    ]
    const l = { ...useReceiveDraft.getState().draft!.lines[0]!, units: MORE }
    useReceiveDraft.setState({ draft: makeDraft([l]) })
    await show()
    const os = jest.replaceProperty(Platform, 'OS', 'android')
    try {
      await fireEvent.press(unitChip())
    } finally {
      os.restore()
    }
    expect(chooseAction).not.toHaveBeenCalled()
    expect(button('thùng')).toBeSelected()
    await fireEvent.press(button('lốc'))
    expect(unitChip('lốc')).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'kg' })).toBeNull()
    await pressSheetDone()
    expect(line('m-1|u-l')).toMatchObject({ unitName: 'lốc' })
  })

  it('HSD (iOS): "Thêm hạn" đặt hôm nay rồi hiện viên chọn ngày compact (minimumDate = ngày phiếu); chọn → ✓ ghi, không đánh dấu', async () => {
    await show()
    expect(screen.queryByTestId('date-picker')).toBeNull()
    await fireEvent.press(addExpiry())
    expect(screen.queryByRole('button', { name: 'Thêm hạn' })).toBeNull()
    const picker = screen.getByTestId('date-picker')
    expect(picker.props.display).toBe('compact')
    expect(picker.props.mode).toBe('date')
    expect(picker.props.minimumDate).toEqual(new Date(2026, 10, 4))
    // Hôm nay (hoặc ngày phiếu nếu phiếu lùi ngày) — luôn ≥ ngày phiếu.
    const today = new Date()
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    expect((picker.props.value as Date).getTime()).toBe(
      Math.max(t0.getTime(), new Date(2026, 10, 4).getTime()),
    )
    await fireEvent(picker, 'valueChange', { nativeEvent: {} }, new Date(2027, 2, 12, 23, 30))
    expect(screen.getByTestId('date-picker').props.value).toEqual(new Date(2027, 2, 12))
    await pressSheetDone()
    expect(line(SON)).toMatchObject({ expiryDate: '2027-03-12', checked: false })
  })

  it('HSD trước ngày phiếu → lỗi tại dòng, không đổi hạn; ✕ "Xoá hạn" bỏ hạn đang có', async () => {
    seedCompose()
    useReceiveDraft.getState().updateLine(SON, { expiryDate: '2027-01-01' }, { check: false })
    await show()
    expect(screen.getByTestId('date-picker').props.value).toEqual(new Date(2027, 0, 1))
    await fireEvent(
      screen.getByTestId('date-picker'),
      'valueChange',
      { nativeEvent: {} },
      new Date(2026, 10, 3),
    )
    expect(screen.getByText('Hạn dùng không được trước ngày nhập của phiếu.')).toBeOnTheScreen()
    expect(screen.getByTestId('date-picker').props.value).toEqual(new Date(2027, 0, 1))
    await fireEvent.press(clearExpiry())
    expect(screen.queryByTestId('date-picker')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Xoá hạn' })).toBeNull()
    expect(addExpiry()).toBeOnTheScreen()
    expect(screen.queryByText('Hạn dùng không được trước ngày nhập của phiếu.')).toBeNull()
    await pressSheetDone()
    expect(line(SON)?.expiryDate).toBeNull()
  })

  it('HSD trên Android: dòng mở hộp chọn ngày của hệ thống', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android')
    const { DateTimePickerAndroid } = jest.requireMock('@react-native-community/datetimepicker')
    try {
      await show()
      await fireEvent.press(addExpiry())
      expect(DateTimePickerAndroid.open).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'date', minimumDate: new Date(2026, 10, 4) }),
      )
      expect(screen.queryByTestId('date-picker')).toBeNull()
      // Chọn xong: dòng hiện ngày (chạm để đổi) + ✕ xoá.
      const { onValueChange } = DateTimePickerAndroid.open.mock.calls[0][0]
      await act(async () => onValueChange({}, new Date(2027, 2, 12)))
      expect(button('Hạn dùng, 12/03/2027')).toBeOnTheScreen()
      await fireEvent.press(clearExpiry())
      expect(addExpiry()).toBeOnTheScreen()
    } finally {
      os.restore()
    }
  })

  it('close with edits asks; discard does not write', async () => {
    await show()
    await fireEvent.changeText(qtyField(), '99')
    await fireEvent.changeText(priceField(), '5000')
    expect(mockGuard.prevent).toBe(true)
    // ✕ → hỏi; "Tiếp tục sửa" → ở lại với chữ đang gõ.
    mockConfirm.mockResolvedValueOnce(false)
    await pressSheetCancel()
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: DISCARD,
        confirmLabel: 'Bỏ thay đổi',
        cancelLabel: 'Tiếp tục sửa',
        destructive: true,
      }),
    )
    expect(mockBack).not.toHaveBeenCalled()
    expect(qtyField().props.value).toBe('99')
    // Vuốt xuống → hỏi; "Tiếp tục sửa" → ở lại.
    mockConfirm.mockResolvedValueOnce(false)
    await swipeDown()
    expect(confirmTitles()).toEqual([DISCARD, DISCARD])
    expect(mockBack).not.toHaveBeenCalled()
    // ✕ → "Bỏ thay đổi" → đóng MỘT lần, KHÔNG ghi gì.
    await pressSheetCancel()
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(line(SON)).toMatchObject({ quantity: 6, unitPrice: 1200000 })
  })

  it('đổi HSD / đơn vị / ghi chú cũng là "đã sửa"; gõ rồi trả về giá trị cũ thì không', async () => {
    await show()
    await fireEvent.changeText(qtyField(), '12')
    expect(mockGuard.prevent).toBe(true)
    await fireEvent.changeText(qtyField(), '6')
    await fireEvent.changeText(priceField(), '1200000')
    expect(mockGuard.prevent).toBe(false)
    await fireEvent.changeText(noteField(), 'x')
    expect(mockGuard.prevent).toBe(true)
    await fireEvent.changeText(noteField(), '  ')
    expect(mockGuard.prevent).toBe(false)
    await fireEvent.press(addExpiry())
    expect(mockGuard.prevent).toBe(true)
    await fireEvent.press(clearExpiry())
    expect(mockGuard.prevent).toBe(false)
    jest.mocked(chooseAction).mockResolvedValueOnce(1)
    await fireEvent.press(unitChip())
    expect(mockGuard.prevent).toBe(true)
  })

  it('đóng khi chưa sửa → đóng ngay, không hỏi; ✓ sau khi sửa không hỏi', async () => {
    await show()
    expect(mockGuard.prevent).toBe(false)
    await pressSheetCancel()
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('✓ sau khi sửa: tắt chặn trước khi đóng (không hỏi)', async () => {
    await show()
    await fireEvent.changeText(qtyField(), '12')
    expect(mockGuard.prevent).toBe(true)
    await pressSheetDone()
    expect(mockGuard.prevent).toBe(false)
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('Xoá khỏi phiếu: dòng có trên server hỏi lại; không → giữ; đồng ý → bỏ và đóng', async () => {
    await show()
    mockConfirm.mockResolvedValueOnce(false)
    await fireEvent.press(button('Xoá khỏi phiếu'))
    await act(async () => undefined)
    expect(mockConfirm.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        title: 'Xoá dòng này khỏi phiếu?',
        confirmLabel: 'Xoá khỏi phiếu',
        destructive: true,
      }),
    )
    expect(line(SON)).toBeDefined()
    expect(mockBack).not.toHaveBeenCalled()
    await fireEvent.press(button('Xoá khỏi phiếu'))
    await act(async () => undefined)
    expect(line(SON)).toBeUndefined()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('Xoá khỏi phiếu: dòng mới thêm trên máy bỏ ngay, không hỏi, kể cả khi đã sửa', async () => {
    seedCompose([makeLine(2, { base: null })])
    mockParams.key = 'm-2|u-2'
    await show()
    await fireEvent.changeText(qtyField(), '4')
    await fireEvent.press(button('Xoá khỏi phiếu'))
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(line('m-2|u-2')).toBeUndefined()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('compose sheet on a form the user cannot edit → read-only: no ✓, no inputs, Xoá locked', async () => {
    // Màn soạn chỉ mở cho phiếu sửa được; sheet tự kiểm lại quyền trên phiếu (deep link, mất quyền).
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CONFIRM'])
    await show()
    const before = useReceiveDraft.getState().draft
    expect(screen.getByText('Bạn không có quyền sửa phiếu này.')).toBeOnTheScreen()
    expect(sheetHeader().done).toBeUndefined()
    expect(screen.queryByLabelText(/^Số lượng \(/)).toBeNull()
    expect(screen.queryByLabelText('Đơn giá')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Tăng' })).toBeNull()
    expect(screen.getByLabelText('Số lượng, 6 thùng')).toBeOnTheScreen()
    const remove = button('Xoá khỏi phiếu')
    expect(remove).toBeDisabled()
    await fireEvent.press(remove)
    expect(useReceiveDraft.getState().draft).toBe(before)
    await pressSheetCancel()
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('đang Lưu → chỉ đọc: không ✓, câu "Đang lưu", ô / nút / dòng HSD khoá (a11y disabled); ✕ vẫn đóng', async () => {
    useReceiveDraft.getState().setSaving(true)
    await show()
    const before = useReceiveDraft.getState().draft
    expect(sheetHeader().done).toBeUndefined()
    expect(screen.getByText('Đang lưu phiếu — chờ lưu xong rồi sửa tiếp.')).toBeOnTheScreen()
    expect(button('Tăng')).toBeDisabled()
    expect(qtyField().props.editable).toBe(false)
    expect(priceField().props.editable).toBe(false)
    expect(noteField().props.editable).toBe(false)
    expect(button('Xoá khỏi phiếu')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /^Đơn vị / })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Thêm hạn' })).toBeNull()
    expect(screen.queryByTestId('date-picker')).toBeNull()
    await fireEvent.press(button('Tăng'))
    expect(qtyField().props.value).toBe('6')
    expect(useReceiveDraft.getState().draft).toBe(before)
    await pressSheetCancel()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('compose ?focus=expiry → cuộn tới khối HSD MỘT lần (không focus ô nào, không tự đặt hạn)', async () => {
    mockParams.focus = 'expiry'
    const scrollTo = jest.spyOn(ScrollView.prototype as unknown as ScrollViewInstance, 'scrollTo')
    const focus = jest.spyOn(TextInput.prototype as unknown as { focus: () => void }, 'focus')
    scrollTo.mockClear()
    focus.mockClear()
    await show()
    expect(screen.queryByTestId('date-picker')).toBeNull()
    expect(addExpiry()).toBeOnTheScreen()
    await fireEvent(screen.getByTestId('import-line-details'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 520, width: 390, height: 120 } },
    })
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ y: 508 }))
    expect(focus).not.toHaveBeenCalled()
    scrollTo.mockClear()
    await fireEvent(screen.getByTestId('import-line-details'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 520, width: 390, height: 460 } },
    })
    expect(scrollTo).not.toHaveBeenCalled()
    focus.mockRestore()
  })

  it('compose ?focus=expiry trên Android → mở hộp chọn ngày của hệ thống MỘT lần', async () => {
    mockParams.focus = 'expiry'
    const os = jest.replaceProperty(Platform, 'OS', 'android')
    const { DateTimePickerAndroid } = jest.requireMock('@react-native-community/datetimepicker')
    try {
      await show()
      expect(DateTimePickerAndroid.open).toHaveBeenCalledTimes(1)
      expect(DateTimePickerAndroid.open).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'date', minimumDate: new Date(2026, 10, 4) }),
      )
    } finally {
      os.restore()
    }
  })

  it('compose ?focus=note → focus ô ghi chú và cuộn tới nó (khối + ô trong khối)', async () => {
    mockParams.focus = 'note'
    const scrollTo = jest.spyOn(ScrollView.prototype as unknown as ScrollViewInstance, 'scrollTo')
    const focus = jest.spyOn(TextInput.prototype as unknown as { focus: () => void }, 'focus')
    scrollTo.mockClear()
    focus.mockClear()
    await show()
    expect(screen.queryByTestId('date-picker')).toBeNull()
    const target = focus.mock.contexts.map(
      (c) => (c as { props: { accessibilityLabel?: string } }).props.accessibilityLabel,
    )
    expect(target).toEqual(['Ghi chú'])
    await fireEvent(screen.getByTestId('import-line-note-section'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 90, width: 390, height: 44 } },
    })
    expect(scrollTo).not.toHaveBeenCalled()
    await fireEvent(screen.getByTestId('import-line-details'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 600, width: 390, height: 200 } },
    })
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ y: 678 }))
    focus.mockRestore()
  })

  it('compose ?focus=quantity (dòng vừa thêm / vừa quét) → focus ô số MỘT lần khi sửa được, không cuộn, không mở lịch', async () => {
    mockParams.focus = 'quantity'
    const scrollTo = jest.spyOn(ScrollView.prototype as unknown as ScrollViewInstance, 'scrollTo')
    const focus = jest.spyOn(TextInput.prototype as unknown as { focus: () => void }, 'focus')
    scrollTo.mockClear()
    focus.mockClear()
    await show()
    const target = focus.mock.contexts.map(
      (c) => (c as { props: { accessibilityLabel?: string } }).props.accessibilityLabel,
    )
    expect(target).toEqual(['Số lượng Sơn Dulux'])
    expect(screen.queryByTestId('date-picker')).toBeNull()
    await fireEvent(screen.getByTestId('import-line-details'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 520, width: 390, height: 120 } },
    })
    expect(scrollTo).not.toHaveBeenCalled()
    focus.mockRestore()
  })

  it('compose ?focus=quantity trên phiếu không sửa được → không focus gì', async () => {
    mockParams.focus = 'quantity'
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CONFIRM'])
    const focus = jest.spyOn(TextInput.prototype as unknown as { focus: () => void }, 'focus')
    focus.mockClear()
    await show()
    expect(screen.getByText('Bạn không có quyền sửa phiếu này.')).toBeOnTheScreen()
    expect(focus).not.toHaveBeenCalled()
    focus.mockRestore()
  })

  it('compose không có ?focus → không cuộn, không mở lịch, không focus', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype as unknown as ScrollViewInstance, 'scrollTo')
    const focus = jest.spyOn(TextInput.prototype as unknown as { focus: () => void }, 'focus')
    scrollTo.mockClear()
    focus.mockClear()
    await show()
    expect(screen.queryByTestId('date-picker')).toBeNull()
    await fireEvent(screen.getByTestId('import-line-details'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 520, width: 390, height: 120 } },
    })
    expect(scrollTo).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
    focus.mockRestore()
  })
})

describe('ReceiveLineSheetScreen — cờ RECEIVE_CHECKLIST_ENABLED tắt ("Duyệt phiếu")', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/features/receive-checklist/model/flags').__setChecklistEnabled(false)
  })

  it('sửa được: không nút "Lưu · sang dòng chưa kiểm tiếp"; ✓ header lưu số, KHÔNG đặt checked, đóng', async () => {
    await show()
    expect(screen.queryByRole('button', { name: 'Lưu · sang dòng chưa kiểm tiếp' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Đánh dấu đã kiểm' })).toBeNull()
    await type('4')
    await pressSheetDone()
    expect(line(SON)).toMatchObject({ quantity: 4, checked: false })
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockSetParams).not.toHaveBeenCalled()
  })

  it('không có quyền sửa: chỉ xem, không "Đánh dấu đã kiểm", không câu "chỉ đánh dấu được"', async () => {
    signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CONFIRM'])
    await show()
    expect(screen.queryByLabelText('Thực nhận')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Đánh dấu đã kiểm' })).toBeNull()
    expect(screen.queryByText(/chỉ đánh dấu/)).toBeNull()
    expect(line(SON)?.checked).toBe(false)
  })
})
