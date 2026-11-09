// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native'
import { Platform, ScrollView, TextInput, type ScrollViewInstance } from 'react-native'

import { item as stockItem } from '@/entities/inventory/model/fixtures'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  stopExportDraftPersistence,
  useExportDraft,
  type ExportLine,
} from '@/features/export-draft'
import { makeDraft, makeLine } from '@/features/export-draft/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { chooseAction, confirmAction } from '@/shared/lib/native-confirm'
import { pressSheetCancel, pressSheetDone, sheetHeader } from '@/shared/ui/testing/sheet-header'

import { ExportLineSheetScreen } from './ExportLineSheetScreen'

const mockBack = jest.fn()
const mockParams: { key?: string; focus?: string } = {}
/**
 * `usePreventRemove` giả: ghi lại sheet có đang chặn rời không và hàm xử lý lần rời bị chặn — `swipeDown()`
 * mô phỏng vuốt xuống / back Android (bị chặn → hàm xử lý, không → đóng luôn). Lối rời thật trên Stack của
 * expo-router: `ExportLineSheetScreen.router.test.tsx`.
 */
const mockGuard: {
  prevent: boolean
  onBlocked: ((e: { repeat: () => void }) => void) | null
} = { prevent: false, onBlocked: null }
const mockDisablePrevention = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  usePreventRemove: (prevent: boolean, onBlocked: (e: { repeat: () => void }) => void) => {
    mockGuard.prevent = prevent
    mockGuard.onBlocked = onBlocked
    return mockDisablePrevention
  },
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))
jest.mock('@/shared/lib/native-confirm', () => ({
  confirmAction: jest.fn(),
  chooseAction: jest.fn(),
}))

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const YEAR = new Date().getFullYear()
const HOP = { unitSlug: 'u-1', unitCode: 'H', unitName: 'hộp', conversionRate: 1, isBaseUnit: true }
const THUNG = {
  unitSlug: 'u-thung',
  unitCode: 'T',
  unitName: 'thùng',
  conversionRate: 12,
  isBaseUnit: false,
}
const page = (items: unknown[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 100, totalPages: 1, hasNext: false })

function server(units: unknown[] = [HOP, THUNG]) {
  route('get', '/warehouses/wh-a/materials', () =>
    page([
      stockItem({
        materialSlug: 'm-1',
        materialCode: 'VT1',
        materialName: 'Vật tư 1',
        availableQuantity: 90,
        baseUnit: { slug: 'u-1', code: 'H', name: 'hộp' },
        units: units as never,
      }),
    ]),
  )
  route('get', '/warehouses/wh-a/material-batches', () =>
    page(
      ['b-1', 'b-2'].map((slug, i) => ({
        slug,
        materialSlug: 'm-1',
        entryDate: `${YEAR}-10-0${i + 1}`,
        expiryDate: i === 0 ? '2027-03-12' : '2027-06-01',
        availableQuantity: 5 + i,
        status: 1,
        baseUnit: { slug: 'u-1', code: 'H', name: 'hộp' },
      })),
    ),
  )
}

let client: QueryClient
const store = () => useExportDraft.getState()
const lines = () => store().draft!.lines

/** Dòng 1 (có trên server, 10 hộp × 1.000 đ) + các dòng thêm. */
function seed(over: ExportLine[] = []) {
  useExportDraft.setState({
    ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'px-1' },
    draft: makeDraft([
      makeLine(1, {
        unitSlug: 'u-1',
        quantity: 10,
        unitPrice: 1000,
        base: { unitSlug: 'u-1', quantity: 10, unitPrice: 1000, batchSlug: null, note: null },
      }),
      ...over,
    ]),
  })
}
/** Dòng vừa thêm từ bộ chọn / quét mã: số lượng 0 (chưa nhập), chưa có giá, chưa có trên server. */
function seedNew() {
  useExportDraft.setState({
    draft: makeDraft([makeLine(1, { unitSlug: 'u-1', quantity: 0, unitPrice: null, base: null })]),
  })
}
async function show() {
  const view = await render(
    <QueryClientProvider client={client}>
      <ExportLineSheetScreen />
    </QueryClientProvider>,
  )
  await act(async () => {
    for (let n = 0; n < 6; n++) await new Promise((r) => setTimeout(r, 0))
  })
  return view
}

const qtyField = () => screen.getByTestId('export-line-sheet-qty')
const priceField = () => screen.getByLabelText('Đơn giá')
const noteField = () => screen.getByLabelText('Ghi chú')
const amount = () =>
  screen.getByLabelText(/^Thành tiền, /).props.accessibilityLabel.replace('Thành tiền, ', '')
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const lotRow = () => button(/^Lô, /)
const unitChip = (unit = 'hộp') => button(`Đơn vị ${unit}, chạm để đổi`)
/** Vuốt xuống / back Android: bị chặn → hỏi (hàm của guard), không → đóng ngay. */
async function swipeDown() {
  await act(async () => {
    if (mockGuard.prevent) mockGuard.onBlocked!({ repeat: () => mockBack() })
    else mockBack()
  })
}
const DISCARD = 'Bỏ thay đổi?'
const confirmTitles = () => jest.mocked(confirmAction).mock.calls.map((c) => c[0].title)

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(async () => {
  jest.clearAllMocks()
  resetFakeApi()
  await AsyncStorage.clear()
  store().reset()
  mockParams.key = 'm-1|u-1|'
  delete mockParams.focus
  mockGuard.prevent = false
  mockGuard.onBlocked = null
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope: ['EXPORT_FORM_READ'], warehouses: [WH] } as never,
  })
  jest.mocked(confirmAction).mockResolvedValue(true)
  jest.mocked(chooseAction).mockResolvedValue(null)
  server()
  seed()
})
afterEach(() => {
  stopExportDraftPersistence()
  store().reset()
  client.clear()
})

describe('ExportLineSheetScreen', () => {
  it('tiêu đề = tên vật tư; điền sẵn từ dòng: số, giá ngăn nghìn, đơn vị, lô "Tự động", thành tiền', async () => {
    await show()
    expect(sheetHeader().title).toBe('Vật tư 1')
    expect(qtyField().props.value).toBe('10')
    expect(qtyField().props.keyboardType).toBe('decimal-pad')
    expect(priceField().props.value).toBe('1.000')
    expect(screen.getByText('đ / hộp')).toBeOnTheScreen()
    expect(unitChip()).toBeOnTheScreen()
    expect(lotRow().props.accessibilityLabel).toBe('Lô, Tự động (HSD sớm nhất)')
    expect(amount()).toBe('10.000 đ')
    // Stepper cỡ to của sheet.
    expect(button('Tăng')).toHaveStyle({ width: 47, height: 32 })
    expect(qtyField()).toHaveStyle({ fontSize: 17, minWidth: 64 })
    // Danh sách lô chỉ bung khi chạm dòng Lô.
    expect(screen.queryByRole('button', { name: 'Tự động (HSD sớm nhất)' })).toBeNull()
  })

  it('dòng vừa thêm (số lượng 0, chưa có giá) → ô số / giá trống, thành tiền "—"', async () => {
    seedNew()
    await show()
    expect(qtyField().props.value).toBe('')
    expect(qtyField().props.placeholder).toBe('0')
    expect(priceField().props.value).toBe('')
    expect(priceField().props.placeholder).toBe('Nhập đơn giá')
    expect(amount()).toBe('—')
  })

  it('gõ không ghi gì; ✓ ghi số, giá, ghi chú bằng MỘT lần updateLine rồi đóng', async () => {
    await show()
    // Đếm lần ghi (zustand chép hàm sang mỗi state mới → bọc qua setState rồi trả lại, không spyOn).
    const original = store().updateLine
    let writes = 0
    useExportDraft.setState({
      updateLine: (...args) => {
        writes++
        return original(...args)
      },
    })
    try {
      await fireEvent.changeText(qtyField(), '7,5')
      await fireEvent.changeText(priceField(), '1250,5')
      await fireEvent.changeText(noteField(), 'Giao gấp')
      expect(lines()[0]).toEqual(
        expect.objectContaining({ quantity: 10, unitPrice: 1000, note: null }),
      )
      await pressSheetDone()
      expect(writes).toBe(1)
    } finally {
      useExportDraft.setState({ updateLine: original })
    }
    expect(lines()).toHaveLength(1)
    expect(lines()[0]).toEqual(
      expect.objectContaining({ quantity: 7.5, unitPrice: 1250.5, note: 'Giao gấp' }),
    )
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(confirmAction).not.toHaveBeenCalled()
  })

  it('✓ with quantity only saves quantity and leaves unitPrice null', async () => {
    seedNew()
    await show()
    await fireEvent.changeText(qtyField(), '12')
    await pressSheetDone()
    expect(lines()[0]).toEqual(expect.objectContaining({ quantity: 12, unitPrice: null }))
    expect(screen.queryByText(/Cần nhập đơn giá/)).toBeNull()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('✓ khi còn thiếu vẫn lưu: số trống = 0 (chưa nhập), giá trống = null', async () => {
    await show()
    await fireEvent.changeText(qtyField(), '')
    await fireEvent.changeText(priceField(), '')
    await pressSheetDone()
    expect(lines()[0]).toEqual(expect.objectContaining({ quantity: 0, unitPrice: null }))
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['abc', 'Số lượng không hợp lệ — chỉ gồm chữ số, tối đa 6 chữ số thập phân'],
    ['1,1234567', 'Số lượng không hợp lệ — chỉ gồm chữ số, tối đa 6 chữ số thập phân'],
    ['1000000000000', 'Số lượng quá lớn'],
  ])('số lượng "%s" → lỗi tại ô, không ghi, không đóng', async (text, message) => {
    await show()
    await fireEvent.changeText(qtyField(), text)
    // Lỗi chỉ hiện sau ✓.
    expect(screen.queryByText(message)).toBeNull()
    await pressSheetDone()
    expect(screen.getByText(message)).toBeOnTheScreen()
    expect(lines()[0]!.quantity).toBe(10)
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('số lượng 6 chữ số lẻ được nhận', async () => {
    await show()
    await fireEvent.changeText(qtyField(), '0,000001')
    await pressSheetDone()
    expect(lines()[0]!.quantity).toBe(0.000001)
  })

  it('✓ with 3 decimals in price shows error and stays', async () => {
    await show()
    await fireEvent.changeText(priceField(), '1,234')
    // Không âm thầm cắt số lẻ thừa khi gõ: ✓ báo lỗi.
    expect(priceField().props.value).toBe('1,234')
    await pressSheetDone()
    expect(screen.getByText('Đơn giá phải ≥ 0, tối đa 2 chữ số thập phân')).toBeOnTheScreen()
    expect(lines()[0]!.unitPrice).toBe(1000)
    expect(mockBack).not.toHaveBeenCalled()
    // Sửa lại → hết lỗi, ghi được.
    await fireEvent.changeText(priceField(), '1,23')
    expect(screen.queryByText('Đơn giá phải ≥ 0, tối đa 2 chữ số thập phân')).toBeNull()
    await pressSheetDone()
    expect(lines()[0]!.unitPrice).toBe(1.23)
  })

  it('đơn giá quá lớn → lỗi, không ghi; đơn giá 0 hợp lệ', async () => {
    await show()
    await fireEvent.changeText(priceField(), '99999999999999999')
    await pressSheetDone()
    expect(screen.getByText('Đơn giá quá lớn')).toBeOnTheScreen()
    expect(mockBack).not.toHaveBeenCalled()
    await fireEvent.changeText(priceField(), '0')
    await pressSheetDone()
    expect(lines()[0]!.unitPrice).toBe(0)
  })

  it('typing 1250000 in price shows 1.250.000 and total updates', async () => {
    await show()
    await fireEvent.changeText(priceField(), '1250000')
    expect(priceField().props.value).toBe('1.250.000')
    expect(amount()).toBe('12.500.000 đ')
    // Thành tiền theo chữ đang gõ ở ô số lượng.
    await fireEvent.changeText(qtyField(), '2')
    expect(amount()).toBe('2.500.000 đ')
    // Dấu nhóm "." gõ theo thói quen không mở phần lẻ.
    await fireEvent.changeText(priceField(), '1.250')
    expect(priceField().props.value).toBe('1.250')
    expect(amount()).toBe('2.500 đ')
    // Thiếu giá / số → "—".
    await fireEvent.changeText(priceField(), '')
    expect(amount()).toBe('—')
    await pressSheetDone()
    expect(lines()[0]).toEqual(expect.objectContaining({ quantity: 2, unitPrice: null }))
  })

  describe('stepper', () => {
    afterEach(() => jest.useRealTimers())

    it('stepper large +/− and long press', async () => {
      await show()
      jest.useFakeTimers()
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      await user.press(button('Tăng'))
      expect(qtyField().props.value).toBe('11')
      await user.press(button('Giảm'))
      await user.press(button('Giảm'))
      expect(qtyField().props.value).toBe('9')
      // Giữ ≥ 400ms → lặp tới khi nhả.
      await user.longPress(button('Tăng'), { duration: 1000 })
      const held = Number(qtyField().props.value)
      expect(held).toBeGreaterThanOrEqual(14)
      await act(async () => void jest.advanceTimersByTime(2000))
      expect(qtyField().props.value).toBe(String(held))
      // Chỉ trong sheet: chưa ✓ thì bản nháp chưa đổi.
      expect(lines()[0]!.quantity).toBe(10)
      jest.useRealTimers()
      await pressSheetDone()
      expect(lines()[0]!.quantity).toBe(held)
    })

    it('ô số chữ sai: + bắt đầu lại từ 0; dòng chưa nhập: + → 1', async () => {
      seedNew()
      await show()
      await fireEvent.press(button('Tăng'))
      expect(qtyField().props.value).toBe('1')
      await fireEvent.changeText(qtyField(), 'abc')
      await fireEvent.press(button('Tăng'))
      expect(qtyField().props.value).toBe('1')
    })

    it('ô số chữ sai: − bắt đầu lại từ 0, KHÔNG hỏi xoá dòng (như sheet phiếu nhập)', async () => {
      await show()
      await fireEvent.changeText(qtyField(), 'abc')
      await fireEvent.press(button('Giảm'))
      expect(confirmAction).not.toHaveBeenCalled()
      // 0 − 1 → 0 = ô trống ("chưa nhập").
      expect(qtyField().props.value).toBe('')
      expect(lines()).toHaveLength(1)
      expect(mockBack).not.toHaveBeenCalled()
    })

    it('− ở số ≤ 1 hỏi xoá dòng: không → giữ; đồng ý → bỏ dòng và đóng', async () => {
      seed([makeLine(2)])
      await show()
      await fireEvent.changeText(qtyField(), '1')
      jest.mocked(confirmAction).mockResolvedValueOnce(false)
      await fireEvent.press(button('Giảm'))
      expect(confirmTitles()).toEqual(['Xoá Vật tư 1 khỏi phiếu?'])
      expect(lines()).toHaveLength(2)
      expect(qtyField().props.value).toBe('1')
      expect(mockBack).not.toHaveBeenCalled()
      await fireEvent.press(button('Giảm'))
      await act(async () => undefined)
      expect(lines().map((l) => l.key)).toEqual(['m-2|u-2|'])
      expect(mockBack).toHaveBeenCalledTimes(1)
      // Đã sửa số rồi xoá: không hỏi "Bỏ thay đổi?".
      expect(confirmTitles()).not.toContain(DISCARD)
    })
  })

  it('đổi đơn vị qua chip "<đv> ▾" (action sheet gốc) = updateLine tại chỗ khi ✓: giữ vị trí và base', async () => {
    seed([makeLine(2)])
    await show()
    jest.mocked(chooseAction).mockResolvedValueOnce(1)
    await fireEvent.press(unitChip())
    expect(jest.mocked(chooseAction).mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        title: 'Vật tư 1',
        actions: [{ label: 'hộp (đang chọn)' }, { label: 'thùng (12 hộp)' }],
      }),
    )
    expect(unitChip('thùng')).toBeOnTheScreen()
    expect(screen.getByText('đ / thùng')).toBeOnTheScreen()
    // Chưa ✓ → chưa ghi.
    expect(lines()[0]!.unitSlug).toBe('u-1')
    await fireEvent.changeText(qtyField(), '2')
    await pressSheetDone()
    expect(lines().map((l) => l.key)).toEqual(['m-1|u-thung|', 'm-2|u-2|'])
    expect(lines()[0]).toEqual(
      expect.objectContaining({
        unitSlug: 'u-thung',
        unitName: 'thùng',
        conversionRate: 12,
        quantity: 2,
        base: { unitSlug: 'u-1', quantity: 10, unitPrice: 1000, batchSlug: null, note: null },
      }),
    )
    // Khoá dòng đổi → dòng "biến mất" theo key cũ: vẫn chỉ đóng MỘT lần.
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('chú thích tỉ lệ dưới nhóm Số lượng: chỉ khi đơn vị không phải gốc', async () => {
    seed([makeLine(2)])
    await show()
    expect(screen.queryByText(/^1 .* = /)).toBeNull()
    jest.mocked(chooseAction).mockResolvedValueOnce(1)
    await fireEvent.press(unitChip())
    await fireEvent.changeText(qtyField(), '2')
    expect(screen.getByText('1 thùng = 12 hộp · 2 thùng = 24 hộp')).toBeOnTheScreen()
    await fireEvent.changeText(qtyField(), '')
    expect(screen.getByText('1 thùng = 12 hộp')).toBeOnTheScreen()
    jest.mocked(chooseAction).mockResolvedValueOnce(0)
    await fireEvent.press(unitChip('thùng'))
    expect(screen.queryByText(/^1 .* = /)).toBeNull()
  })

  it('unit change to a duplicate key shows error and stays', async () => {
    seed([makeLine(1, { unitSlug: 'u-thung', quantity: 3 })])
    await show()
    jest.mocked(chooseAction).mockResolvedValueOnce(1)
    await fireEvent.press(unitChip())
    await pressSheetDone()
    expect(screen.getByText(/Đã có dòng cùng vật tư, đơn vị và lô này/)).toBeOnTheScreen()
    expect(lines().map((l) => [l.key, l.quantity])).toEqual([
      ['m-1|u-1|', 10],
      ['m-1|u-thung|', 3],
    ])
    expect(mockBack).not.toHaveBeenCalled()
    // Chọn lại đơn vị cũ → hết lỗi, ✓ đóng.
    jest.mocked(chooseAction).mockResolvedValueOnce(0)
    await fireEvent.press(unitChip('thùng'))
    expect(screen.queryByText(/Đã có dòng cùng vật tư/)).toBeNull()
    await pressSheetDone()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('Android, hơn 3 đơn vị: chip mở danh sách đơn vị ngay trong sheet', async () => {
    const LOC = { ...THUNG, unitSlug: 'u-loc', unitCode: 'L', unitName: 'lốc', conversionRate: 6 }
    const KG = { ...THUNG, unitSlug: 'u-kg', unitCode: 'K', unitName: 'kg', conversionRate: 2 }
    resetFakeApi()
    server([HOP, THUNG, LOC, KG])
    await show()
    const os = Platform.OS
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    try {
      await fireEvent.press(unitChip())
    } finally {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
    }
    expect(chooseAction).not.toHaveBeenCalled()
    expect(button('hộp')).toBeSelected()
    await fireEvent.press(button('lốc'))
    expect(unitChip('lốc')).toBeOnTheScreen()
    // Chọn xong thì danh sách thu lại.
    expect(screen.queryByRole('button', { name: 'kg' })).toBeNull()
    await pressSheetDone()
    expect(lines()[0]).toEqual(expect.objectContaining({ key: 'm-1|u-loc|', conversionRate: 6 }))
  })

  it('dòng Lô bung BatchPicker; chọn lô → dòng hiện nhãn lô, ✓ ghi lô + HSD (khoá đổi theo lô)', async () => {
    await show()
    await fireEvent.press(lotRow())
    expect(lotRow()).toHaveProp('accessibilityState', { disabled: false, expanded: true })
    expect(button('Tự động (HSD sớm nhất)')).toBeSelected()
    await fireEvent.press(button(/^HSD 12\/03\/2027/))
    expect(lotRow().props.accessibilityLabel).toMatch(/^Lô, HSD 12\/03\/2027/)
    expect(lotRow()).toHaveProp('accessibilityState', { disabled: false, expanded: false })
    await pressSheetDone()
    expect(lines()[0]).toEqual(
      expect.objectContaining({
        key: 'm-1|u-1|b-1',
        batchSlug: 'b-1',
        batchExpiryDate: '2027-03-12',
      }),
    )
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('chọn lại "Tự động" → bỏ lô và HSD', async () => {
    useExportDraft.setState({
      draft: makeDraft([
        makeLine(1, {
          unitSlug: 'u-1',
          batchSlug: 'b-1',
          batchExpiryDate: '2027-03-12',
          key: 'm-1|u-1|b-1',
        }),
      ]),
    })
    mockParams.key = 'm-1|u-1|b-1'
    await show()
    expect(lotRow().props.accessibilityLabel).toMatch(/^Lô, HSD 12\/03\/2027/)
    await fireEvent.press(lotRow())
    expect(button(/^HSD 12\/03\/2027/)).toBeSelected()
    await fireEvent.press(button('Tự động (HSD sớm nhất)'))
    await pressSheetDone()
    expect(lines()[0]).toEqual(
      expect.objectContaining({ key: 'm-1|u-1|', batchSlug: null, batchExpiryDate: null }),
    )
  })

  it('đổi lô tạo trùng dòng khác → lỗi tại dòng Lô, không ghi, không đóng; lô khác → ghi được', async () => {
    seed([
      makeLine(1, {
        unitSlug: 'u-1',
        batchSlug: 'b-1',
        batchExpiryDate: '2027-03-12',
        quantity: 3,
      }),
    ])
    await show()
    await fireEvent.changeText(qtyField(), '99')
    await fireEvent.press(lotRow())
    await fireEvent.press(button(/^HSD 12\/03\/2027/))
    await pressSheetDone()
    expect(
      screen.getByText(
        'Đã có dòng cùng vật tư, đơn vị và lô này — chọn lô khác hoặc gộp số lượng vào dòng đó.',
      ),
    ).toBeOnTheScreen()
    expect(lines().map((l) => [l.key, l.quantity])).toEqual([
      ['m-1|u-1|', 10],
      ['m-1|u-1|b-1', 3],
    ])
    expect(mockBack).not.toHaveBeenCalled()
    await fireEvent.press(lotRow())
    await fireEvent.press(button(/^HSD 01\/06\/2027/))
    expect(screen.queryByText(/Đã có dòng cùng vật tư/)).toBeNull()
    await pressSheetDone()
    expect(lines()[0]).toEqual(expect.objectContaining({ key: 'm-1|u-1|b-2', quantity: 99 }))
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('swipe/close with edits asks Bỏ thay đổi?; discard does not write', async () => {
    await show()
    await fireEvent.changeText(qtyField(), '99')
    await fireEvent.changeText(priceField(), '5000')
    expect(mockGuard.prevent).toBe(true)

    // ✕ → hỏi; "Tiếp tục sửa" → ở lại với chữ đang gõ.
    jest.mocked(confirmAction).mockResolvedValueOnce(false)
    await pressSheetCancel()
    expect(confirmAction).toHaveBeenCalledWith(
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
    jest.mocked(confirmAction).mockResolvedValueOnce(false)
    await swipeDown()
    expect(confirmTitles()).toEqual([DISCARD, DISCARD])
    expect(mockBack).not.toHaveBeenCalled()

    // Vuốt xuống → "Bỏ thay đổi" → rời, KHÔNG ghi gì.
    await swipeDown()
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(lines()[0]).toEqual(expect.objectContaining({ quantity: 10, unitPrice: 1000 }))
  })

  it('✕ with edits → Bỏ thay đổi → closes once without writing', async () => {
    await show()
    await fireEvent.changeText(noteField(), 'abc')
    await pressSheetCancel()
    expect(confirmTitles()).toEqual([DISCARD])
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(lines()[0]!.note).toBeNull()
  })

  it('close without edits leaves without asking', async () => {
    await show()
    expect(mockGuard.prevent).toBe(false)
    await pressSheetCancel()
    expect(mockBack).toHaveBeenCalledTimes(1)
    await swipeDown()
    expect(confirmAction).not.toHaveBeenCalled()
  })

  it('gõ rồi trả về đúng giá trị cũ / mở rồi đóng danh sách lô → coi như chưa sửa', async () => {
    await show()
    await fireEvent.changeText(qtyField(), '12')
    expect(mockGuard.prevent).toBe(true)
    await fireEvent.changeText(qtyField(), '10')
    await fireEvent.press(lotRow())
    await fireEvent.press(lotRow())
    expect(mockGuard.prevent).toBe(false)
    await pressSheetCancel()
    expect(confirmAction).not.toHaveBeenCalled()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('dòng vừa thêm đóng không nhập gì → giữ dòng, không hỏi', async () => {
    seedNew()
    await show()
    await pressSheetCancel()
    expect(confirmAction).not.toHaveBeenCalled()
    expect(lines()).toHaveLength(1)
  })

  it('✓ after edits does not ask (guard off before closing)', async () => {
    await show()
    await fireEvent.changeText(qtyField(), '12')
    expect(mockGuard.prevent).toBe(true)
    await pressSheetDone()
    expect(mockGuard.prevent).toBe(false)
    expect(confirmAction).not.toHaveBeenCalled()
  })

  it('Xoá khỏi phiếu asks for a server line, removes a new line at once', async () => {
    seed([makeLine(2, { base: null })])
    await show()
    // Dòng có trên server → hỏi; không → giữ nguyên.
    jest.mocked(confirmAction).mockResolvedValueOnce(false)
    await fireEvent.press(button('Xoá khỏi phiếu'))
    expect(jest.mocked(confirmAction).mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        title: 'Xoá dòng này khỏi phiếu?',
        confirmLabel: 'Xoá khỏi phiếu',
        destructive: true,
      }),
    )
    expect(lines()).toHaveLength(2)
    expect(mockBack).not.toHaveBeenCalled()
    await fireEvent.press(button('Xoá khỏi phiếu'))
    await act(async () => undefined)
    expect(lines().map((l) => l.key)).toEqual(['m-2|u-2|'])
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('Xoá khỏi phiếu: dòng mới (chưa có trên server) bỏ ngay, không hỏi, kể cả khi đã sửa', async () => {
    seed([makeLine(2, { base: null })])
    mockParams.key = 'm-2|u-2|'
    await show()
    await fireEvent.changeText(qtyField(), '4')
    await fireEvent.press(button('Xoá khỏi phiếu'))
    expect(confirmAction).not.toHaveBeenCalled()
    expect(lines().map((l) => l.key)).toEqual(['m-1|u-1|'])
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('saving → read only', async () => {
    useExportDraft.setState({ saving: true })
    await show()
    expect(sheetHeader().done).toBeUndefined()
    expect(screen.getByText('Đang lưu phiếu — chờ lưu xong rồi sửa tiếp.')).toBeOnTheScreen()
    expect(button('Tăng')).toBeDisabled()
    expect(button('Giảm')).toBeDisabled()
    expect(qtyField().props.editable).toBe(false)
    expect(priceField().props.editable).toBe(false)
    expect(noteField().props.editable).toBe(false)
    expect(button('Xoá khỏi phiếu')).toBeDisabled()
    // Chip đơn vị chỉ còn là chữ; dòng Lô báo khoá (trình đọc màn hình) và không bung.
    expect(screen.queryByRole('button', { name: /^Đơn vị / })).toBeNull()
    expect(lotRow()).toBeDisabled()
    await fireEvent.press(lotRow())
    expect(screen.queryByRole('button', { name: 'Tự động (HSD sớm nhất)' })).toBeNull()
    await fireEvent.press(button('Tăng'))
    expect(qtyField().props.value).toBe('10')
    // ✕ vẫn đóng.
    await pressSheetCancel()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('đã sửa rồi phiếu bắt đầu lưu (chỉ đọc) → tắt chặn: ✕ đóng ngay, không hỏi', async () => {
    await show()
    await fireEvent.changeText(qtyField(), '99')
    expect(mockGuard.prevent).toBe(true)
    await act(async () => useExportDraft.setState({ saving: true }))
    expect(mockGuard.prevent).toBe(false)
    await pressSheetCancel()
    expect(confirmAction).not.toHaveBeenCalled()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('nhãn "Đơn giá" hiện trên dòng không phải phần tử a11y riêng (VoiceOver không đọc hai lần)', async () => {
    await show()
    const label = screen.getByText('Đơn giá')
    expect(label.props.accessible).toBe(false)
    expect(label.props.importantForAccessibility).toBe('no')
    expect(priceField()).toBeOnTheScreen()
  })

  it('dòng không còn (key lạ) → đóng sheet, không render', async () => {
    mockParams.key = 'khong-co'
    await show()
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('Đơn giá')).toBeNull()
  })

  it('?focus=lot → bung danh sách lô và cuộn tới khối Lô (một lần, không focus ô nào)', async () => {
    mockParams.focus = 'lot'
    const scrollTo = jest.spyOn(ScrollView.prototype as unknown as ScrollViewInstance, 'scrollTo')
    const focus = jest.spyOn(TextInput.prototype as unknown as { focus: () => void }, 'focus')
    scrollTo.mockClear()
    focus.mockClear()
    await show()
    expect(lotRow()).toHaveProp('accessibilityState', { disabled: false, expanded: true })
    await fireEvent(screen.getByTestId('export-line-details'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 420, width: 390, height: 200 } },
    })
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ y: 408 }))
    expect(focus).not.toHaveBeenCalled()
    // Đo lại (danh sách lô tải xong) không cuộn lần nữa.
    scrollTo.mockClear()
    await fireEvent(screen.getByTestId('export-line-details'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 430, width: 390, height: 260 } },
    })
    expect(scrollTo).not.toHaveBeenCalled()
    focus.mockRestore()
  })

  it('?focus=note → focus ô ghi chú và cuộn tới nó', async () => {
    mockParams.focus = 'note'
    const scrollTo = jest.spyOn(ScrollView.prototype as unknown as ScrollViewInstance, 'scrollTo')
    const focus = jest.spyOn(TextInput.prototype as unknown as { focus: () => void }, 'focus')
    scrollTo.mockClear()
    focus.mockClear()
    await show()
    const target = focus.mock.contexts.map(
      (c) => (c as { props: { accessibilityLabel?: string } }).props.accessibilityLabel,
    )
    expect(target).toEqual(['Ghi chú'])
    expect(lotRow()).toHaveProp('accessibilityState', { disabled: false, expanded: false })
    // Vị trí ô ghi chú = vị trí khối + vị trí ô trong khối (đo theo hai lần layout, thứ tự nào cũng được).
    await fireEvent(screen.getByTestId('export-line-note-section'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 45, width: 390, height: 44 } },
    })
    expect(scrollTo).not.toHaveBeenCalled()
    await fireEvent(screen.getByTestId('export-line-details'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 700, width: 390, height: 140 } },
    })
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ y: 733 }))
    focus.mockRestore()
  })

  it('?focus=quantity (dòng vừa thêm / vừa quét) → focus ô số, không cuộn; đang lưu → không focus', async () => {
    mockParams.focus = 'quantity'
    const scrollTo = jest.spyOn(ScrollView.prototype as unknown as ScrollViewInstance, 'scrollTo')
    const focus = jest.spyOn(TextInput.prototype as unknown as { focus: () => void }, 'focus')
    scrollTo.mockClear()
    focus.mockClear()
    const view = await show()
    const target = () =>
      focus.mock.contexts.map(
        (c) => (c as { props: { accessibilityLabel?: string } }).props.accessibilityLabel,
      )
    expect(target()).toEqual(['Số lượng Vật tư 1'])
    expect(lotRow()).toHaveProp('accessibilityState', { disabled: false, expanded: false })
    await fireEvent(screen.getByTestId('export-line-details'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 420, width: 390, height: 200 } },
    })
    expect(scrollTo).not.toHaveBeenCalled()
    await view.unmount()
    focus.mockClear()
    useExportDraft.setState({ saving: true })
    await show()
    expect(focus).not.toHaveBeenCalled()
    focus.mockRestore()
  })

  it('không có ?focus → không cuộn, không focus', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype as unknown as ScrollViewInstance, 'scrollTo')
    scrollTo.mockClear()
    await show()
    await fireEvent(screen.getByTestId('export-line-details'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 420, width: 390, height: 200 } },
    })
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
