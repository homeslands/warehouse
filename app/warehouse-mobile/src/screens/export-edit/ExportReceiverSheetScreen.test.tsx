// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { stopExportDraftPersistence, useExportDraft } from '@/features/export-draft'
import { makeDraft } from '@/features/export-draft/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { pressSheetDone, sheetHeader } from '@/shared/ui/testing/sheet-header'

import { ExportReceiverSheetScreen } from './ExportReceiverSheetScreen'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const WH_HN = { slug: 'wh-hn', code: 'HN', name: 'Kho Hà Nội', isManager: false }
const LIST_URL = '/warehouses/wh-a/export-forms'
const recentItems = (n: number) =>
  ok({
    items: Array.from({ length: n }, (_, i) => ({
      receiver: ['Tổ hàn A', 'Bếp B', 'tổ hàn a'][i] ?? `Người ${i}`,
      createdAt: `2026-11-0${5 - Math.min(i, 4)}T08:00:00Z`,
    })),
    total: n,
    page: 1,
    pageSize: 50,
    totalPages: 1,
    hasNext: false,
  })

let client: QueryClient
const store = () => useExportDraft.getState()
const wait = (ms = 0) => act(async () => new Promise((r) => setTimeout(r, ms)))

function seed(header: Partial<ReturnType<typeof makeDraft>['header']> = {}) {
  const d = makeDraft([])
  useExportDraft.setState({
    ctx: { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'new' },
    draft: { ...d, header: { ...d.header, receiver: '', ...header } },
  })
}
async function show() {
  await render(
    <QueryClientProvider client={client}>
      <ExportReceiverSheetScreen />
    </QueryClientProvider>,
  )
  await wait()
}
const cards = () =>
  screen.queryAllByRole('button').map((b) => b.props.accessibilityLabel as string | undefined)
const card = (name: string) => screen.getByRole('button', { name })
const search = () => screen.getByLabelText('Tìm hoặc nhập tên người nhận')

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(async () => {
  jest.clearAllMocks()
  resetFakeApi()
  await AsyncStorage.clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({
    current: WH,
    warehouses: null,
    resolved: true,
    resolution: 'selected',
  })
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u', userName: 'an', scope: [], warehouses: [WH, WH_HN] } as never,
  })
})
afterEach(() => {
  stopExportDraftPersistence()
  store().reset()
  client.clear()
})

describe('ExportReceiverSheetScreen', () => {
  it('người nhận gần đây (bỏ trùng); chạm chỉ đánh dấu, ✓ ghi rồi đóng', async () => {
    route('get', LIST_URL, () => recentItems(3))
    seed()
    await show()
    expect(sheetHeader().title).toBe('Người nhận')
    expect(cards()).toEqual(['Tổ hàn A', 'Bếp B'])
    // Chưa chọn gì → chưa có ✓ (chỉ ✕).
    expect(sheetHeader().done).toBeUndefined()
    await fireEvent.press(card('Bếp B'))
    expect(card('Bếp B')).toBeSelected()
    expect(store().draft!.header.receiver).toBe('')
    await pressSheetDone()
    expect(store().draft!.header.receiver).toBe('Bếp B')
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('tối đa 8 người nhận gần đây; giá trị gõ tay đang có đứng đầu và được chọn', async () => {
    route('get', LIST_URL, () => recentItems(12))
    seed({ receiver: 'Anh Nam' })
    await show()
    expect(cards()).toHaveLength(9)
    expect(cards()[0]).toBe('Anh Nam')
    expect(card('Anh Nam')).toBeSelected()
  })

  it('ô gõ lọc danh sách (bỏ dấu); tên mới → thẻ "Dùng …" đứng đầu, chọn + ✓ ghi tên đã cắt khoảng trắng', async () => {
    route('get', LIST_URL, () => recentItems(3))
    seed()
    await show()
    await fireEvent.changeText(search(), 'to han')
    expect(cards()).toEqual(['Dùng “to han”', 'Tổ hàn A'])
    await fireEvent.changeText(search(), ' Anh Nam ')
    expect(cards()).toEqual(['Dùng “Anh Nam”'])
    await fireEvent.press(card('Dùng “Anh Nam”'))
    await pressSheetDone()
    expect(store().draft!.header.receiver).toBe('Anh Nam')
  })

  it('gõ trùng tên có sẵn (khác hoa thường) → không có thẻ "Dùng …"; phím Xong chọn tên có sẵn', async () => {
    route('get', LIST_URL, () => recentItems(3))
    seed()
    await show()
    await fireEvent.changeText(search(), 'bếp b')
    expect(cards()).toEqual(['Bếp B'])
    await fireEvent(search(), 'submitEditing')
    expect(store().draft!.header.receiver).toBe('Bếp B')
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('phím Xong với tên mới → ghi tên đó và đóng', async () => {
    route('get', LIST_URL, () => recentItems(0))
    seed()
    await show()
    expect(screen.getByText('Chưa có người nhận gần đây — gõ tên ở ô trên.')).toBeOnTheScreen()
    await fireEvent.changeText(search(), 'Kho đối tác')
    await fireEvent(search(), 'submitEditing')
    expect(store().draft!.header.receiver).toBe('Kho đối tác')
  })

  it('thẻ "Dùng …" đã chọn đi theo chữ đang gõ', async () => {
    route('get', LIST_URL, () => recentItems(0))
    seed()
    await show()
    await fireEvent.changeText(search(), 'Anh Na')
    await fireEvent.press(card('Dùng “Anh Na”'))
    await fireEvent.changeText(search(), 'Anh Nam')
    expect(card('Dùng “Anh Nam”')).toBeSelected()
    await pressSheetDone()
    expect(store().draft!.header.receiver).toBe('Anh Nam')
  })

  it('Chuyển kho: các kho TRỪ kho hiện tại, nhãn "Tên (MÃ)"; chọn → ghi tên kho', async () => {
    seed({ type: 'TRANSFER' })
    await show()
    expect(cards()).toEqual(['Kho Hà Nội (HN)'])
    await fireEvent.press(card('Kho Hà Nội (HN)'))
    await pressSheetDone()
    expect(store().draft!.header.receiver).toBe('Kho Hà Nội')
  })

  it('Chuyển kho, ADMIN+ (store kho có danh sách mọi kho): theo danh sách đó', async () => {
    useWarehouseStore.setState({
      warehouses: [WH, WH_HN, { slug: 'wh-dn', code: 'DN', name: 'Kho Đà Nẵng', isManager: false }],
    })
    seed({ type: 'TRANSFER' })
    await show()
    expect(cards()).toEqual(['Kho Hà Nội (HN)', 'Kho Đà Nẵng (DN)'])
  })

  it('Chuyển kho chỉ có kho hiện tại → câu hướng dẫn gõ tên', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { userSlug: 'u', userName: 'an', scope: [], warehouses: [WH] } as never,
    })
    seed({ type: 'TRANSFER' })
    await show()
    expect(cards()).toEqual([])
    expect(screen.getByText('Không có kho khác để chuyển — gõ tên ở ô trên.')).toBeOnTheScreen()
  })

  it('đang ghi phiếu → ✓ và phím Xong không ghi', async () => {
    route('get', LIST_URL, () => recentItems(2))
    seed()
    await show()
    await act(async () => {
      store().setSaving(true)
    })
    await fireEvent.press(card('Bếp B'))
    expect(sheetHeader().done).toBeUndefined()
    await fireEvent.changeText(search(), 'Anh Nam')
    await fireEvent(search(), 'submitEditing')
    expect(store().draft!.header.receiver).toBe('')
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('không còn bản nháp → tự đóng', async () => {
    await show()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })
})
