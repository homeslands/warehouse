// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { ScrollView, TextInput, type ScrollViewInstance } from 'react-native'

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
/** "Bớt 1" — cách duy nhất sửa số lượng trong sheet (spec export-scan-only §7). */
const dec = () => fireEvent.press(button('Bớt 1'))
const serialDrop = (serial: string) => button(`Bỏ serial ${serial}`)
/** Dòng 1 (ĐV hộp ×1): 3 serial quét (A1 B2 C3), số lượng 3. */
function seedScanned(over: Partial<ExportLine> = {}) {
  useExportDraft.setState({
    draft: makeDraft([
      makeLine(1, { unitSlug: 'u-1', quantity: 3, serials: ['A1', 'B2', 'C3'], ...over }),
    ]),
  })
}
const priceField = () => screen.getByLabelText('Đơn giá')
const noteField = () => screen.getByLabelText('Ghi chú')
const amount = () =>
  screen.getByLabelText(/^Thành tiền, /).props.accessibilityLabel.replace('Thành tiền, ', '')
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const lotRow = () => button(/^Lô, /)
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
  it('bản nháp thuộc kho khác kho đang chọn → đóng sheet, không hiện gì', async () => {
    useExportDraft.setState({ ctx: { userSlug: 'u', warehouseSlug: 'wh-b', formSlug: 'px-1' } })
    await show()
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('Đơn giá')).toBeNull()
  })

  it('tiêu đề = tên vật tư; điền sẵn từ dòng: số chỉ đọc, giá ngăn nghìn, lô "Tự động", thành tiền', async () => {
    await show()
    expect(sheetHeader().title).toBe('Vật tư 1')
    expect(qtyField()).toHaveTextContent('10')
    expect(qtyField().props.editable).toBeUndefined()
    expect(screen.getByText('hộp')).toBeOnTheScreen()
    expect(priceField().props.value).toBe('1.000')
    expect(screen.getByText('đ / hộp')).toBeOnTheScreen()
    expect(lotRow().props.accessibilityLabel).toBe('Lô, Tự động (HSD sớm nhất)')
    expect(amount()).toBe('10.000 đ')
    // Không còn chip đơn vị / stepper.
    expect(screen.queryByRole('button', { name: /^Đơn vị / })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Tăng' })).toBeNull()
    // Vùng chạm "Bớt 1" ≥ 44pt.
    expect(button('Bớt 1')).toHaveStyle({ minWidth: 44, minHeight: 44 })
    // Danh sách lô chỉ bung khi chạm dòng Lô.
    expect(screen.queryByRole('button', { name: 'Tự động (HSD sớm nhất)' })).toBeNull()
  })

  it('dòng số lượng 0, chưa có giá → số "0", Bớt 1 tắt, không có khối serial, thành tiền "—"', async () => {
    seedNew()
    await show()
    expect(qtyField()).toHaveTextContent('0')
    expect(button('Bớt 1')).toBeDisabled()
    expect(screen.queryByTestId('export-line-serials')).toBeNull()
    expect(priceField().props.value).toBe('')
    expect(priceField().props.placeholder).toBe('Nhập đơn giá')
    expect(amount()).toBe('—')
  })

  it('sửa không ghi gì; ✓ ghi số, serial, giá, ghi chú bằng MỘT lần updateLine rồi đóng', async () => {
    seedScanned()
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
      await dec()
      await fireEvent.changeText(priceField(), '1250,5')
      await fireEvent.changeText(noteField(), 'Giao gấp')
      expect(lines()[0]).toEqual(
        expect.objectContaining({ quantity: 3, unitPrice: 1000, note: null }),
      )
      expect(lines()[0]!.serials).toEqual(['A1', 'B2', 'C3'])
      await pressSheetDone()
      expect(writes).toBe(1)
    } finally {
      useExportDraft.setState({ updateLine: original })
    }
    expect(lines()).toHaveLength(1)
    expect(lines()[0]).toEqual(
      expect.objectContaining({ quantity: 2, unitPrice: 1250.5, note: 'Giao gấp' }),
    )
    expect(lines()[0]!.serials).toEqual(['A1', 'B2'])
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(confirmAction).not.toHaveBeenCalled()
  })

  it('✓ khi giá trống vẫn lưu: giá = null, số lượng giữ nguyên', async () => {
    await show()
    await fireEvent.changeText(priceField(), '')
    await pressSheetDone()
    expect(lines()[0]).toEqual(expect.objectContaining({ quantity: 10, unitPrice: null }))
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  describe('số lượng + serial (chỉ Bớt 1 / ✕)', () => {
    it('Bớt 1 bỏ serial CUỐI và quantity − 1; khối serial theo thứ tự quét', async () => {
      seedScanned()
      await show()
      expect(screen.getByText('A1')).toBeOnTheScreen()
      expect(screen.getByText('B2')).toBeOnTheScreen()
      expect(screen.getByText('C3')).toBeOnTheScreen()
      expect(screen.queryByTestId('export-line-unscanned')).toBeNull()
      await dec()
      expect(qtyField()).toHaveTextContent('2')
      expect(screen.queryByText('C3')).toBeNull()
      expect(screen.getByText('B2')).toBeOnTheScreen()
      // Chưa ✓ → bản nháp chưa đổi.
      expect(lines()[0]!.quantity).toBe(3)
      await pressSheetDone()
      expect(lines()[0]).toEqual(expect.objectContaining({ quantity: 2 }))
      expect(lines()[0]!.serials).toEqual(['A1', 'B2'])
    })

    it('✕ cạnh serial bỏ đúng serial đó (giữa danh sách) và quantity − 1', async () => {
      seedScanned()
      await show()
      await fireEvent.press(serialDrop('B2'))
      expect(qtyField()).toHaveTextContent('2')
      expect(screen.queryByText('B2')).toBeNull()
      await pressSheetDone()
      expect(lines()[0]!.quantity).toBe(2)
      // Phải là A1, C3 — không phải cắt 2 serial đầu.
      expect(lines()[0]!.serials).toEqual(['A1', 'C3'])
    })

    it('phần không có serial: "k chưa có serial"; Bớt 1 khi hết serial chỉ trừ số lượng', async () => {
      seedScanned({ quantity: 5 })
      await show()
      expect(screen.getByText('2 chưa có serial')).toBeOnTheScreen()
      await dec()
      await dec()
      await dec()
      // 5 → 2 và đã bỏ cả 3 serial.
      expect(qtyField()).toHaveTextContent('2')
      expect(screen.queryByText('A1')).toBeNull()
      expect(screen.getByText('2 chưa có serial')).toBeOnTheScreen()
    })

    it('dòng không có serial nào: chỉ dòng xám "k chưa có serial" (theo đơn vị gốc)', async () => {
      seed()
      await show()
      expect(screen.getByTestId('export-line-unscanned')).toHaveTextContent('10 chưa có serial')
      await dec()
      expect(screen.getByTestId('export-line-unscanned')).toHaveTextContent('9 chưa có serial')
      await pressSheetDone()
      expect(lines()[0]).toEqual(expect.objectContaining({ quantity: 9 }))
      expect(lines()[0]!.serials ?? []).toEqual([])
    })

    it('đơn vị thùng ×12: phần chưa có serial tính theo đơn vị gốc', async () => {
      seedScanned({ unitSlug: 'u-thung', unitName: 'thùng', conversionRate: 12, quantity: 1 })
      mockParams.key = 'm-1|u-thung|'
      await show()
      expect(screen.getByText('thùng')).toBeOnTheScreen()
      expect(screen.getByText('9 chưa có serial')).toBeOnTheScreen()
    })

    it('về 0 bị chặn: Bớt 1 và ✕ tắt khi quantity − 1 ≤ 0; muốn xoá dùng "Xoá khỏi phiếu"', async () => {
      seedScanned({ quantity: 1, serials: ['A1'] })
      await show()
      expect(button('Bớt 1')).toBeDisabled()
      expect(serialDrop('A1')).toBeDisabled()
      await fireEvent.press(button('Bớt 1'))
      await fireEvent.press(serialDrop('A1'))
      expect(qtyField()).toHaveTextContent('1')
      expect(screen.getByText('A1')).toBeOnTheScreen()
      expect(confirmAction).not.toHaveBeenCalled()
    })

    it('số lẻ: 1,5 → Bớt 1 tắt (0,5 > 0 vẫn cho; 0,5 − 1 < 0 thì tắt)', async () => {
      seedScanned({ quantity: 1.5, serials: [] })
      await show()
      expect(qtyField()).toHaveTextContent('1,5')
      await dec()
      expect(qtyField()).toHaveTextContent('0,5')
      expect(button('Bớt 1')).toBeDisabled()
    })

    it('đổi số lượng / serial = đã sửa (hỏi "Bỏ thay đổi?"); thành tiền theo số lượng cục bộ', async () => {
      seedScanned()
      await show()
      expect(mockGuard.prevent).toBe(false)
      expect(amount()).toBe('3.000 đ')
      await fireEvent.press(serialDrop('A1'))
      expect(mockGuard.prevent).toBe(true)
      expect(amount()).toBe('2.000 đ')
      await pressSheetCancel()
      expect(confirmTitles()).toEqual([DISCARD])
      expect(lines()[0]!.serials).toEqual(['A1', 'B2', 'C3'])
    })

    it('đang lưu → ✕ và Bớt 1 tắt', async () => {
      seedScanned()
      useExportDraft.setState({ saving: true })
      await show()
      expect(button('Bớt 1')).toBeDisabled()
      expect(serialDrop('A1')).toBeDisabled()
      await fireEvent.press(serialDrop('A1'))
      expect(qtyField()).toHaveTextContent('3')
    })
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
    await dec()
    expect(amount()).toBe('11.250.000 đ')
    // Dấu nhóm "." gõ theo thói quen không mở phần lẻ.
    await fireEvent.changeText(priceField(), '1.250')
    expect(priceField().props.value).toBe('1.250')
    expect(amount()).toBe('11.250 đ')
    // Thiếu giá / số → "—".
    await fireEvent.changeText(priceField(), '')
    expect(amount()).toBe('—')
    await pressSheetDone()
    expect(lines()[0]).toEqual(expect.objectContaining({ quantity: 9, unitPrice: null }))
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
    await dec()
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
    expect(lines()[0]).toEqual(expect.objectContaining({ key: 'm-1|u-1|b-2', quantity: 9 }))
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('swipe/close with edits asks Bỏ thay đổi?; discard does not write', async () => {
    await show()
    await dec()
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
    expect(qtyField()).toHaveTextContent('9')

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

  it('mở rồi đóng danh sách lô / gõ rồi trả về đúng giá cũ → coi như chưa sửa', async () => {
    await show()
    await fireEvent.changeText(priceField(), '1.200')
    expect(mockGuard.prevent).toBe(true)
    await fireEvent.changeText(priceField(), '1.000')
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
    await dec()
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
    await dec()
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
    expect(button('Bớt 1')).toBeDisabled()
    expect(priceField().props.editable).toBe(false)
    expect(noteField().props.editable).toBe(false)
    expect(button('Xoá khỏi phiếu')).toBeDisabled()
    // Dòng Lô báo khoá (trình đọc màn hình) và không bung.
    expect(lotRow()).toBeDisabled()
    await fireEvent.press(lotRow())
    expect(screen.queryByRole('button', { name: 'Tự động (HSD sớm nhất)' })).toBeNull()
    await fireEvent.press(button('Bớt 1'))
    expect(qtyField()).toHaveTextContent('10')
    // ✕ vẫn đóng.
    await pressSheetCancel()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('đã sửa rồi phiếu bắt đầu lưu (chỉ đọc) → tắt chặn: ✕ đóng ngay, không hỏi', async () => {
    await show()
    await dec()
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

  it('?focus=quantity không còn hỗ trợ → không focus ô nào, không cuộn', async () => {
    mockParams.focus = 'quantity'
    const scrollTo = jest.spyOn(ScrollView.prototype as unknown as ScrollViewInstance, 'scrollTo')
    const focus = jest.spyOn(TextInput.prototype as unknown as { focus: () => void }, 'focus')
    scrollTo.mockClear()
    focus.mockClear()
    await show()
    await fireEvent(screen.getByTestId('export-line-details'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 420, width: 390, height: 200 } },
    })
    expect(focus).not.toHaveBeenCalled()
    expect(scrollTo).not.toHaveBeenCalled()
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

  it('phiếu không phải Bán: không có khối Đơn giá / Thành tiền; ✓ giữ nguyên giá cũ của dòng', async () => {
    seed()
    const d = store().draft!
    useExportDraft.setState({ draft: { ...d, header: { ...d.header, type: 'PRODUCTION' } } })
    await show()
    expect(screen.queryByTestId('export-line-sheet-price')).toBeNull()
    expect(screen.queryByTestId('export-line-sheet-amount')).toBeNull()
    await fireEvent.changeText(noteField(), 'Giao gấp')
    await pressSheetDone()
    expect(lines()[0]).toEqual(expect.objectContaining({ unitPrice: 1000, note: 'Giao gấp' }))
  })
})
