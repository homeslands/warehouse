// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { item as stockItem } from '@/entities/inventory/model/fixtures'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { stopExportDraftPersistence, useExportDraft } from '@/features/export-draft'
import { makeDraft, makeForm, makeLine } from '@/features/export-draft/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { sheetHeader } from '@/shared/ui/testing/sheet-header'

import { ExportAddLineSheetScreen } from './ExportAddLineSheetScreen'
import { useLineFocus } from '@/shared/lib/line-focus'

const mockBack = jest.fn()
const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    navigate: mockNavigate,
    canGoBack: () => true,
    replace: jest.fn(),
  }),
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const KG = { unitSlug: 'kg', unitCode: 'KG', unitName: 'kg', conversionRate: 1, isBaseUnit: true }
const BAO = {
  unitSlug: 'bao',
  unitCode: 'BAO',
  unitName: 'bao',
  conversionRate: 50,
  isBaseUnit: false,
}
const page = (items: unknown[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 100, totalPages: 1, hasNext: false })

const XI = stockItem({
  materialSlug: 'xi-mang',
  materialCode: 'XM40',
  materialName: 'Xi măng PCB40',
  availableQuantity: 1200,
  baseUnit: { slug: 'kg', code: 'KG', name: 'kg' },
  units: [KG, BAO],
})
const XIT = stockItem({
  materialSlug: 'xi-trang',
  materialCode: 'XT',
  materialName: 'Xi trắng',
  availableQuantity: 0,
  baseUnit: { slug: 'kg', code: 'KG', name: 'kg' },
  units: [KG],
})
const SON = stockItem({
  materialSlug: 'son',
  materialCode: 'SN1',
  materialName: 'Sơn Dulux',
  availableQuantity: 4,
  baseUnit: { slug: 'lit', code: 'L', name: 'lít' },
  units: [{ unitSlug: 'lit', unitCode: 'L', unitName: 'lít', conversionRate: 1, isBaseUnit: true }],
})

const KEO = stockItem({
  materialSlug: 'keo',
  materialCode: 'KEO',
  materialName: 'Keo chưa khai đơn vị',
  availableQuantity: 3,
  baseUnit: null,
  units: [],
})

let client: QueryClient
const store = () => useExportDraft.getState()
const wait = (ms: number) => act(async () => new Promise((r) => setTimeout(r, ms)))

function seed(lines = [makeLine(1)], formSlug = 'px-1') {
  useExportDraft.setState({
    ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug },
    draft: makeDraft(lines),
  })
}
function signIn(scope: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope, warehouses: [WH] } as never,
  })
}
async function show() {
  route('get', '/warehouses/wh-a/materials', () => page([XI, XIT, SON, KEO]))
  route('get', '/warehouses/wh-a/export-forms/px-1', () =>
    ok(makeForm([], { warehouseSlug: 'wh-a', requesterSlug: 'u' })),
  )
  await render(
    <QueryClientProvider client={client}>
      <ExportAddLineSheetScreen />
    </QueryClientProvider>,
  )
  await wait(0)
  await wait(0)
}
async function search(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Tìm theo mã hoặc tên'), text)
  await wait(350)
}
const box = (name: string) => screen.getByRole('checkbox', { name: new RegExp(name) })
const addButton = () => screen.getByRole('button', { name: /^Thêm \d+ vật tư$/ })

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(async () => {
  jest.clearAllMocks()
  resetFakeApi()
  await AsyncStorage.clear()
  store().reset()
  useLineFocus.getState().clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
  signIn(['EXPORT_FORM_READ', 'EXPORT_FORM_CREATE', 'EXPORT_FORM_UPDATE_DRAFT'])
  seed()
})
afterEach(() => {
  stopExportDraftPersistence()
  store().reset()
  client.clear()
})

describe('ExportAddLineSheetScreen — chọn nhiều vật tư như web', () => {
  it('tiêu đề "Thêm vật tư", chỉ có ✕; ô tìm trống → hiện tồn của kho, mỗi dòng: tên, mã, "còn n <đv gốc>" / "Hết hàng", ô tick', async () => {
    await show()
    expect(sheetHeader().title).toBe('Thêm vật tư')
    expect(sheetHeader().done).toBeUndefined()
    expect(screen.getByText('Xi măng PCB40')).toBeOnTheScreen()
    expect(screen.getByText('XM40')).toBeOnTheScreen()
    expect(screen.getByText('còn 1.200 kg')).toBeOnTheScreen()
    expect(screen.getByText('Hết hàng')).toBeOnTheScreen()
    expect(box('Xi măng PCB40')).not.toBeChecked()
  })

  it('tìm theo tên / mã, bỏ dấu, không phân biệt hoa thường', async () => {
    await show()
    await search('xi')
    expect(screen.getByText('Xi măng PCB40')).toBeOnTheScreen()
    expect(screen.getByText('Xi trắng')).toBeOnTheScreen()
    expect(screen.queryByText('Sơn Dulux')).toBeNull()
    await search('SN1')
    expect(screen.getByText('Sơn Dulux')).toBeOnTheScreen()
    expect(screen.queryByText('Xi măng PCB40')).toBeNull()
    await search('son dulux')
    expect(screen.getByText('Sơn Dulux')).toBeOnTheScreen()
    await search('khongco')
    expect(screen.getByText('Không có vật tư phù hợp')).toBeOnTheScreen()
  })

  it('tick / bỏ tick; nút đáy "Thêm n vật tư" theo số đã tick, khoá khi 0; tick giữ qua lần đổi từ khoá', async () => {
    await show()
    expect(addButton()).toBeDisabled()
    expect(addButton()).toHaveTextContent('Thêm 0 vật tư')
    await fireEvent.press(box('Xi măng PCB40'))
    expect(box('Xi măng PCB40')).toBeChecked()
    await search('son')
    await fireEvent.press(box('Sơn Dulux'))
    expect(addButton()).toHaveTextContent('Thêm 2 vật tư')
    expect(addButton()).toBeEnabled()
    await fireEvent.press(box('Sơn Dulux'))
    expect(addButton()).toHaveTextContent('Thêm 1 vật tư')
  })

  it('vật tư đã tick rồi trở thành "đã có" (vd vừa quét thêm) → không tính vào số trên nút', async () => {
    await show()
    await fireEvent.press(box('Sơn Dulux'))
    await fireEvent.press(box('Xi măng PCB40'))
    expect(addButton()).toHaveTextContent('Thêm 2 vật tư')
    await act(async () => void store().addLine(makeLine(9, { materialSlug: 'son' })))
    expect(addButton()).toHaveTextContent('Thêm 1 vật tư')
  })

  it('Chọn tất cả: tick mọi vật tư chọn được đang hiện (bỏ qua đã có / chưa đơn vị), nút đáy đổi theo, bấm lại bỏ tick', async () => {
    seed([makeLine(1, { materialSlug: 'son', unitSlug: 'thung', batchSlug: 'b-1' })])
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Chọn tất cả' }))
    expect(box('Xi măng PCB40')).toBeChecked()
    expect(box('Xi trắng')).toBeChecked()
    expect(box('Sơn Dulux')).not.toBeChecked()
    expect(box('Keo chưa khai đơn vị')).not.toBeChecked()
    expect(addButton()).toHaveTextContent('Thêm 2 vật tư')
    await fireEvent.press(screen.getByRole('button', { name: 'Bỏ chọn tất cả' }))
    expect(addButton()).toHaveTextContent('Thêm 0 vật tư')
  })

  it('vật tư hết hàng vẫn tick được', async () => {
    await show()
    await fireEvent.press(box('Xi trắng'))
    expect(box('Xi trắng')).toBeChecked()
  })

  it('vật tư đã có trên phiếu (bất kỳ đơn vị / lô) → "đã có", không tick được; chưa khai đơn vị → không tick được', async () => {
    seed([makeLine(1, { materialSlug: 'son', unitSlug: 'thung', batchSlug: 'b-1' })])
    await show()
    expect(box('Sơn Dulux')).toBeDisabled()
    expect(screen.getByText('đã có')).toBeOnTheScreen()
    await fireEvent.press(box('Sơn Dulux'))
    expect(box('Sơn Dulux')).not.toBeChecked()
    expect(box('Keo chưa khai đơn vị')).toBeDisabled()
    expect(screen.getByText('Chưa có đơn vị')).toBeOnTheScreen()
  })

  it('xác nhận → mỗi vật tư một dòng: đơn vị gốc, lô tự động, số lượng 0 (chưa nhập → Gửi duyệt khoá), chưa có đơn giá; đóng + yêu cầu mở sheet của dòng đầu', async () => {
    await show()
    await fireEvent.press(box('Sơn Dulux'))
    await fireEvent.press(box('Xi măng PCB40'))
    await fireEvent.press(addButton())
    const lines = store().draft!.lines
    // Theo thứ tự danh sách tồn (không theo thứ tự tick).
    expect(lines.map((l) => l.key)).toEqual(['m-1|u-1|', 'xi-mang|kg|', 'son|lit|'])
    expect(lines[1]).toEqual({
      key: 'xi-mang|kg|',
      materialSlug: 'xi-mang',
      materialCode: 'XM40',
      materialName: 'Xi măng PCB40',
      unitSlug: 'kg',
      unitName: 'kg',
      conversionRate: 1,
      quantity: 0,
      unitPrice: null,
      batchSlug: null,
      batchExpiryDate: null,
      note: null,
      base: null,
    })
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(useLineFocus.getState().request).toEqual({
      kind: 'export',
      formSlug: 'px-1',
      key: 'xi-mang|kg|',
    })
  })

  it('sức chứa = 200 − số dòng: đủ thì không tick thêm được + báo', async () => {
    seed(Array.from({ length: 199 }, (_, i) => makeLine(i + 1000)))
    await show()
    await fireEvent.press(box('Xi măng PCB40'))
    expect(box('Sơn Dulux')).toBeDisabled()
    expect(screen.getByText('Phiếu tối đa 200 dòng')).toBeOnTheScreen()
    await fireEvent.press(addButton())
    expect(store().draft!.lines).toHaveLength(200)
  })

  it('nhãn đọc của dòng giữ "mã" và nhãn đã có / chưa có đơn vị', async () => {
    seed([makeLine(1, { materialSlug: 'son' })])
    await show()
    expect(
      screen.getByRole('checkbox', { name: 'Xi măng PCB40, mã XM40, còn 1.200 kg' }),
    ).toBeOnTheScreen()
    expect(
      screen.getByRole('checkbox', { name: 'Sơn Dulux, mã SN1, còn 4 lít, đã có' }),
    ).toBeOnTheScreen()
    expect(
      screen.getByRole('checkbox', {
        name: 'Keo chưa khai đơn vị, mã KEO, còn 3, Chưa có đơn vị',
      }),
    ).toBeOnTheScreen()
  })

  it('ô tìm giữ nguyên (chữ đã gõ) khi tồn kho tải xong; báo đủ dòng hiện cả khi đang tải', async () => {
    seed(Array.from({ length: 200 }, (_, i) => makeLine(i + 1000)))
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    route('get', '/warehouses/wh-a/materials', async () => {
      await gate
      return page([XI, XIT, SON, KEO])
    })
    route('get', '/warehouses/wh-a/export-forms/px-1', () =>
      ok(makeForm([], { warehouseSlug: 'wh-a', requesterSlug: 'u' })),
    )
    await render(
      <QueryClientProvider client={client}>
        <ExportAddLineSheetScreen />
      </QueryClientProvider>,
    )
    await wait(0)
    const input = screen.getByLabelText('Tìm theo mã hoặc tên')
    await fireEvent.changeText(input, 'xi')
    expect(screen.getByText('Phiếu tối đa 200 dòng')).toBeOnTheScreen()
    expect(screen.queryByText('Xi măng PCB40')).toBeNull()
    release()
    await wait(0)
    await wait(350)
    expect(screen.getByText('Xi măng PCB40')).toBeOnTheScreen()
    expect(screen.getByLabelText('Tìm theo mã hoặc tên')).toBe(input)
    expect(input).toHaveDisplayValue('xi')
  })

  it('đủ 200 dòng → báo, không tick được gì', async () => {
    seed(Array.from({ length: 200 }, (_, i) => makeLine(i + 1000)))
    await show()
    expect(screen.getByText('Phiếu tối đa 200 dòng')).toBeOnTheScreen()
    expect(box('Xi măng PCB40')).toBeDisabled()
  })

  it('không còn bản nháp → đóng sheet', async () => {
    store().reset()
    await show()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('không được sửa phiếu (chỉ UPDATE_DRAFT_OWN mà phiếu của người khác) → đóng sheet', async () => {
    signIn(['EXPORT_FORM_READ', 'EXPORT_FORM_UPDATE_DRAFT_OWN'])
    route('get', '/warehouses/wh-a/export-forms/px-1', () =>
      ok(makeForm([], { warehouseSlug: 'wh-a', requesterSlug: 'khac' })),
    )
    route('get', '/warehouses/wh-a/materials', () => page([XI]))
    await render(
      <QueryClientProvider client={client}>
        <ExportAddLineSheetScreen />
      </QueryClientProvider>,
    )
    await wait(0)
    await wait(0)
    expect(mockBack).toHaveBeenCalled()
  })
})
