// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import type {
  NativeStackHeaderItem,
  NativeStackHeaderItemButton,
  NativeStackNavigationOptions,
} from 'expo-router'
import { Platform, StyleSheet } from 'react-native'

import type { ExportForm } from '@/entities/export-form'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { ExportListScreen } from './ExportListScreen'
import { resetExportListOnWarehouseChange, useExportListFilter } from './export-list.store'

const mockPush = jest.fn()
const mockNavigate = jest.fn()
const mockHeader: { options: NativeStackNavigationOptions } = { options: {} }
const mockRouter = { push: mockPush, navigate: mockNavigate }
jest.mock('expo-router', () => ({
  // Ổn định như router thật (`useRouterActions` memo): đổi định danh mỗi render sẽ làm hỏng memo header.
  useRouter: () => mockRouter,
  Stack: {
    Screen: ({ options }: { options: NativeStackNavigationOptions }) => {
      mockHeader.options = options
      return null
    },
  },
}))

const WH_A = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const WH_B = { slug: 'wh-b', code: 'B', name: 'Kho Thủ Đức', isManager: false }
const norm = (s: string) => s.replace(/\s/g, ' ')

/** Mốc ISO của `daysAgo` ngày trước (giờ máy) lúc h:m — không phụ thuộc múi giờ máy chạy test. */
function localAt(daysAgo: number, h: number, m: number) {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() - daysAgo, h, m).toISOString()
}

const form = (over: Partial<ExportForm> = {}): ExportForm => ({
  slug: 'px-1',
  createdAt: localAt(0, 9, 5),
  updatedAt: '2026-11-01T00:00:00.000Z',
  version: 1,
  code: 'PX-20261101-0900',
  type: 'PRODUCTION',
  status: 'PENDING',
  purchaseOrder: 'PO-77',
  invoiceCode: null,
  requesterSlug: 'u-1',
  requesterName: 'Tuấn',
  approverSlug: null,
  approverName: null,
  receiver: 'Tổ hàn A',
  totalAmount: 46176000,
  note: null,
  file: null,
  warehouseSlug: 'wh-a',
  ...over,
})

type Params = Record<string, unknown>
const seen: Params[] = []
const paged = (items: ExportForm[], page = 1, hasNext = false) =>
  ok({
    items,
    total: items.length,
    page,
    pageSize: 20,
    totalPages: 1,
    hasNext,
    hasPrevious: page > 1,
  })

function listRoute(handler: (p: Params) => ReturnType<typeof ok> = () => paged([form()])) {
  route('get', '/warehouses/wh-a/export-forms', (config) => {
    seen.push((config.params ?? {}) as Params)
    return handler((config.params ?? {}) as Params)
  })
}

let client: QueryClient
async function settled() {
  await act(async () => {
    const tick = () => new Promise((r) => setTimeout(r, 0))
    await tick()
    for (let n = 0; n < 100 && client.isFetching() > 0; n++) await tick()
    await tick()
  })
}

async function show() {
  await render(
    <QueryClientProvider client={client}>
      <ExportListScreen />
    </QueryClientProvider>,
  )
  await settled()
}

const SEARCH_LABEL = 'Mã phiếu, số HĐ hoặc PO'

const waitDebounce = (ms: number) => act(async () => new Promise((r) => setTimeout(r, ms)))

async function typeSearch(text: string) {
  await act(async () => fireEvent.changeText(screen.getByLabelText(SEARCH_LABEL), text))
  await waitDebounce(320)
  await settled()
}

const rightItems = (): NativeStackHeaderItem[] =>
  mockHeader.options.unstable_headerRightItems?.({ tintColor: undefined, canGoBack: false }) ?? []
const filterItem = () =>
  rightItems().find((i): i is NativeStackHeaderItemButton => i.type === 'button')!

const READ = 'EXPORT_FORM_READ'
function signIn(scope: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u-1', userName: 'an', scope, warehouses: [WH_A] } as never,
  })
}

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => AsyncStorage.clear())

beforeEach(() => {
  jest.clearAllMocks()
  resetFakeApi()
  seen.length = 0
  mockHeader.options = {}
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useExportListFilter.getState().reset()
  useWarehouseStore.setState({ current: WH_A, resolved: true, resolution: 'selected' })
  signIn([READ, 'EXPORT_FORM_CREATE', 'EXPORT_FORM_CONFIRM'])
})

afterEach(() => client.clear())

describe('ExportListScreen — danh sách', () => {
  it('dòng: mã (code), "Loại · Người nhận · Người lập", tổng tiền, giờ HH:mm', async () => {
    listRoute()
    await show()
    expect(screen.getByText('PX-20261101-0900')).toBeOnTheScreen()
    expect(screen.getByText('Sản xuất · Tổ hàn A · Tuấn')).toBeOnTheScreen()
    expect(norm(screen.getByText(/46\.176\.000/).props.children as string)).toBe('46.176.000 đ')
    expect(screen.getByText('09:05')).toBeOnTheScreen()
  })

  it('ô trạng thái: Tất cả · Nháp · Chờ duyệt · Đã xuất · Đã huỷ', async () => {
    listRoute()
    await show()
    for (const name of ['Tất cả', 'Nháp', 'Chờ duyệt', 'Đã xuất', 'Đã huỷ'])
      expect(screen.getByRole('tab', { name })).toBeOnTheScreen()
  })

  it('có EXPORT_FORM_CONFIRM (MANAGER) → mặc định "Chờ duyệt" (status=PENDING)', async () => {
    listRoute()
    await show()
    expect(screen.getByRole('tab', { name: 'Chờ duyệt' })).toBeSelected()
    expect(seen[0]).toMatchObject({ status: 'PENDING', sort: 'DESC', page: 1 })
  })

  it('không có EXPORT_FORM_CONFIRM (SUPERVISOR) → mặc định "Nháp" (status=DRAFT)', async () => {
    signIn([READ, 'EXPORT_FORM_CREATE'])
    listRoute()
    await show()
    expect(screen.getByRole('tab', { name: 'Nháp' })).toBeSelected()
    expect(seen[0]).toMatchObject({ status: 'DRAFT' })
  })

  it('chọn "Đã xuất" → status=CONFIRMED; "Tất cả" không gửi status', async () => {
    listRoute()
    await show()
    await act(async () => fireEvent.press(screen.getByRole('tab', { name: 'Đã xuất' })))
    await settled()
    expect(seen.at(-1)).toMatchObject({ status: 'CONFIRMED' })
    await act(async () => fireEvent.press(screen.getByRole('tab', { name: 'Tất cả' })))
    await settled()
    expect(seen.at(-1)).not.toHaveProperty('status')
  })

  it('ô trạng thái hiện cả khi tiếng Anh', async () => {
    await changeLanguage('en')
    try {
      listRoute()
      await show()
      for (const name of ['All', 'Draft', 'Pending', 'Issued', 'Cancelled'])
        expect(screen.getByRole('tab', { name })).toBeOnTheScreen()
    } finally {
      await act(async () => changeLanguage('vi'))
    }
  })

  it('ô trạng thái của dòng theo trạng thái: DRAFT / PENDING / CONFIRMED / CANCELLED', async () => {
    listRoute(() =>
      paged(
        (['DRAFT', 'PENDING', 'CONFIRMED', 'CANCELLED'] as const).map((status) =>
          form({ slug: status, code: status, status }),
        ),
      ),
    )
    await show()
    for (const st of ['DRAFT', 'PENDING', 'CONFIRMED', 'CANCELLED'])
      expect(screen.getByTestId(`export-tile-${st}`)).toBeOnTheScreen()
  })

  it('nhãn truy cập của dòng: mã, trạng thái, loại, người nhận, người lập, tổng, giờ', async () => {
    listRoute()
    await show()
    const label = norm(
      screen.getByRole('button', { name: /PX-20261101-0900/ }).props.accessibilityLabel as string,
    )
    for (const part of [
      'PX-20261101-0900',
      'Chờ duyệt',
      'Sản xuất',
      'Tổ hàn A',
      'Tuấn',
      '46.176.000 đ',
      '09:05',
    ])
      expect(label).toContain(part)
  })

  it('nhóm theo ngày tạo: Hôm nay / Hôm qua', async () => {
    listRoute(() =>
      paged([
        form({ slug: 'a', code: 'A', createdAt: localAt(0, 10, 0) }),
        form({ slug: 'b', code: 'B', createdAt: localAt(0, 8, 0) }),
        form({ slug: 'c', code: 'C', createdAt: localAt(1, 17, 30) }),
      ]),
    )
    await show()
    expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual([
      'Hôm nay',
      'Hôm qua',
    ])
    expect(screen.getAllByTestId('export-row')).toHaveLength(3)
  })

  it('worst case: mã 32 ký tự, người nhận 255 ký tự, tổng ≥ 1e12 → mọi chữ một dòng, cột phải giữ độ rộng', async () => {
    listRoute(() =>
      paged([form({ code: 'P'.repeat(32), receiver: 'R'.repeat(255), totalAmount: 3.5e12 })]),
    )
    await show()
    expect(screen.getByText('P'.repeat(32)).props.numberOfLines).toBe(1)
    expect(screen.getByText(/R{255}/).props.numberOfLines).toBe(1)
    const total = screen.getByText(/3\.500\.000\.000\.000/)
    expect(total.props.numberOfLines).toBe(1)
    expect(total.props.adjustsFontSizeToFit).toBe(true)
    expect(StyleSheet.flatten(screen.getByTestId('export-row-end').props.style)).toMatchObject({
      width: expect.any(Number),
    })
  })

  it('gõ "px-26" (debounce 300ms) ở Mã → code=PX-26; sang HĐ → invoiceCode; PO → purchaseOrder', async () => {
    listRoute()
    await show()
    expect(screen.queryByRole('tab', { name: 'HĐ' })).toBeNull()
    await typeSearch('px-26')
    expect(seen.at(-1)).toMatchObject({ code: 'PX-26', status: 'PENDING' })
    await act(async () => fireEvent.press(screen.getByRole('tab', { name: 'HĐ' })))
    await settled()
    expect(seen.at(-1)).toMatchObject({ invoiceCode: 'px-26' })
    expect(seen.at(-1)).not.toHaveProperty('code')
    await act(async () => fireEvent.press(screen.getByRole('tab', { name: 'PO' })))
    await settled()
    expect(seen.at(-1)).toMatchObject({ purchaseOrder: 'px-26' })
  })

  it('cuộn tới cuối → trang 2 đúng một lần', async () => {
    listRoute((p) =>
      p.page === 2
        ? paged([form({ slug: 'px-2', code: 'PX-2' })], 2, false)
        : paged([form()], 1, true),
    )
    await show()
    const list = screen.getByTestId('export-list')
    await fireEvent(list, 'endReached')
    await fireEvent(list, 'endReached')
    await settled()
    expect(seen.filter((p) => p.page === 2)).toHaveLength(1)
    expect(screen.getByText('PX-2')).toBeOnTheScreen()
  })

  it('chạm dòng → push /export/<slug>', async () => {
    listRoute()
    await show()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: /PX-20261101-0900/ })))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/export/[formSlug]',
      params: { formSlug: 'px-1' },
    })
  })

  it('rỗng → "Chưa có phiếu xuất"; có tìm kiếm mà rỗng → "Không tìm thấy phiếu"', async () => {
    listRoute(() => paged([]))
    await show()
    expect(screen.getByText('Chưa có phiếu xuất')).toBeOnTheScreen()
    await typeSearch('zz')
    expect(screen.getByText('Không tìm thấy phiếu')).toBeOnTheScreen()
  })

  it('lỗi lần đầu → EmptyState + Thử lại; thử lại được', async () => {
    let fail = true
    listRoute(() => (fail ? failure(500, 100001) : paged([form()])))
    await show()
    expect(screen.getByText('Không tải được phiếu xuất')).toBeOnTheScreen()
    fail = false
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Thử lại' })))
    await settled()
    expect(screen.getByText('PX-20261101-0900')).toBeOnTheScreen()
  })

  it('làm mới lỗi khi đã có dữ liệu → ErrorBanner, giữ dòng cũ', async () => {
    listRoute()
    await show()
    route('get', '/warehouses/wh-a/export-forms', () => 'network')
    const [pull] = screen.container.queryAll((n) => n.type === 'RCTRefreshControl')
    await fireEvent(pull, 'refresh')
    await settled()
    expect(screen.getByText('Không làm mới được danh sách')).toBeOnTheScreen()
    expect(screen.getByText('PX-20261101-0900')).toBeOnTheScreen()
  })
})

describe('ExportListScreen — header & nút "+" tạo phiếu', () => {
  const original = Platform.OS
  afterEach(() => {
    Platform.OS = original
  })
  const fab = () => screen.getByRole('button', { name: 'Tạo phiếu xuất' })

  it('iOS: KHÔNG dùng ô tìm native (nháy khi đổi tab, iOS 26); bên phải [Lọc, khoảng, kho]', async () => {
    Platform.OS = 'ios'
    listRoute()
    await show()
    expect(mockHeader.options.headerSearchBarOptions).toBeUndefined()
    expect(screen.getByLabelText(SEARCH_LABEL)).toBeOnTheScreen()
    expect(rightItems().map((i) => i.type)).toEqual(['button', 'spacing', 'custom'])
  })

  it('iOS: render lại vì state khác (trạng thái, chữ tìm) KHÔNG dựng lại options của header', async () => {
    Platform.OS = 'ios'
    listRoute()
    await show()
    const before = mockHeader.options
    await act(async () => useExportListFilter.getState().setStatus('PENDING'))
    await settled()
    await act(async () => useExportListFilter.getState().setQuery('x'))
    expect(mockHeader.options).toBe(before)
  })

  it.each(['ios', 'android'] as const)(
    '%s: ô tìm là mục đầu của danh sách (SearchField), gõ → store → gọi API; nút xoá → trống',
    async (os) => {
      Platform.OS = os
      listRoute()
      await show()
      expect(mockHeader.options.headerSearchBarOptions).toBeUndefined()
      const field = screen.getByLabelText(SEARCH_LABEL)
      expect(field.props).toMatchObject({
        returnKeyType: 'search',
        autoCapitalize: 'none',
        autoCorrect: false,
      })
      const order = screen.container
        .queryAll(
          (n) => n.props.accessibilityLabel === SEARCH_LABEL || n.props.testID === 'export-status',
        )
        .map((n) => n.props.testID ?? 'search')
      expect(order[0]).toBe('search')
      await act(async () => fireEvent.changeText(field, 'px-26'))
      expect(useExportListFilter.getState().query).toBe('px-26')
      await waitDebounce(320)
      await settled()
      expect(seen.at(-1)).toMatchObject({ code: 'PX-26' })
      expect(screen.getByRole('tab', { name: 'HĐ' })).toBeOnTheScreen()
      await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Xoá tìm kiếm' })))
      expect(useExportListFilter.getState().query).toBe('')
      expect(screen.getByLabelText(SEARCH_LABEL).props.value).toBe('')
    },
  )

  it('list + always opens modal /export-form/new/info bằng navigate (có hay chưa có bản nháp phiếu mới)', async () => {
    listRoute()
    await show()
    await act(async () => fireEvent.press(fab()))
    await settled()
    expect(mockNavigate).toHaveBeenCalledWith('/export-form/new/info')
    await AsyncStorage.setItem('warehouse.exportDraft.u-1.wh-a.new', JSON.stringify({ any: 1 }))
    await act(async () => fireEvent.press(fab()))
    await settled()
    expect(mockNavigate).toHaveBeenCalledTimes(2)
    expect(mockNavigate).toHaveBeenLastCalledWith('/export-form/new/info')
  })

  it('không có EXPORT_FORM_CREATE → không có nút "+"', async () => {
    signIn([READ])
    listRoute()
    await show()
    expect(screen.queryByRole('button', { name: 'Tạo phiếu xuất' })).toBeNull()
  })
})

describe('ExportListScreen — nút "Lọc", dòng tóm tắt, bộ lọc Loại', () => {
  const original = Platform.OS
  afterEach(() => {
    Platform.OS = original
  })

  it('iOS: mục "Lọc" (button) → navigate /export-filter; đang lọc → icon đặc', async () => {
    Platform.OS = 'ios'
    listRoute()
    await show()
    expect(filterItem()).toMatchObject({
      label: 'Lọc',
      icon: { type: 'sfSymbol', name: 'line.3.horizontal.decrease.circle' },
    })
    await act(async () => filterItem().onPress())
    expect(mockNavigate).toHaveBeenLastCalledWith('/export-filter')
    await act(async () => useExportListFilter.setState({ type: 'SALE' }))
    await settled()
    expect(filterItem()).toMatchObject({
      accessibilityLabel: 'Lọc, đang lọc',
      icon: { name: 'line.3.horizontal.decrease.circle.fill' },
    })
  })

  it('Android: nút "Lọc" 44pt → /export-filter', async () => {
    Platform.OS = 'android'
    listRoute()
    await show()
    const header = await render(
      mockHeader.options.headerRight!({ canGoBack: false } as never) as never,
    )
    const button = header.getByRole('button', { name: 'Lọc' })
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({ width: 44, height: 44 })
    await fireEvent.press(button)
    expect(mockNavigate).toHaveBeenLastCalledWith('/export-filter')
  })

  it('chưa lọc → không có dòng tóm tắt', async () => {
    listRoute()
    await show()
    expect(screen.queryByTestId('filter-summary')).toBeNull()
  })

  it('lọc Loại → gửi type, tóm tắt hiện tên loại, chạm dòng → /export-filter', async () => {
    useExportListFilter.setState({ type: 'DISPOSAL', time: 'last7' })
    listRoute()
    await show()
    expect(seen.at(-1)).toMatchObject({ type: 'DISPOSAL', status: 'PENDING' })
    const line = screen.getByRole('button', { name: 'Bộ lọc: 7 ngày qua · Huỷ' })
    await act(async () => fireEvent.press(line))
    expect(mockNavigate).toHaveBeenLastCalledWith('/export-filter')
  })

  it('chỉ lọc Loại: ✕ trên tóm tắt xoá cả Loại, GIỮ ô tìm và trạng thái', async () => {
    useExportListFilter.setState({ status: 'CONFIRMED', query: 'px', type: 'SALE' })
    listRoute()
    await show()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Xoá lọc' })))
    await settled()
    expect(useExportListFilter.getState()).toMatchObject({
      status: 'CONFIRMED',
      query: 'px',
      type: null,
    })
    expect(seen.at(-1)).not.toHaveProperty('type')
  })

  it('rỗng + có bộ lọc → "Không có phiếu khớp bộ lọc" + Xoá lọc (xoá cả Loại)', async () => {
    useExportListFilter.setState({ type: 'SALE' })
    listRoute(() => paged([]))
    await show()
    expect(screen.getByText('Không có phiếu khớp bộ lọc')).toBeOnTheScreen()
    const clearButtons = screen.getAllByRole('button', { name: 'Xoá lọc' })
    expect(clearButtons).toHaveLength(2)
    await act(async () => fireEvent.press(clearButtons[1]))
    await settled()
    expect(useExportListFilter.getState().type).toBeNull()
    expect(screen.getByText('Chưa có phiếu xuất')).toBeOnTheScreen()
  })
})

describe('ExportListScreen — đổi kho', () => {
  let off: () => void
  beforeEach(() => (off = resetExportListOnWarehouseChange()))
  afterEach(() => off())

  it('đổi kho → ô tìm kiếm được xoá, GIỮ trạng thái và Loại; hiện phiếu kho mới', async () => {
    listRoute()
    route('get', '/warehouses/wh-b/export-forms', () =>
      paged([form({ slug: 'px-b', code: 'PX-B-1', warehouseSlug: 'wh-b' })]),
    )
    await show()
    await typeSearch('px')
    expect(screen.getByLabelText(SEARCH_LABEL).props.value).toBe('px')
    await act(async () => useExportListFilter.setState({ type: 'SALE' }))
    await act(async () => useWarehouseStore.setState({ current: WH_B }))
    expect(useExportListFilter.getState()).toMatchObject({ query: '', type: 'SALE' })
    expect(screen.getByLabelText(SEARCH_LABEL).props.value).toBe('')
    await settled()
    expect(screen.getByText('PX-B-1')).toBeOnTheScreen()
    expect(callsTo('get', '/warehouses/wh-b/export-forms').length).toBeGreaterThan(0)
  })

  it('reset (hết phiên) → status về chưa chọn: quyền quyết định mặc định lần dùng sau', async () => {
    useExportListFilter.getState().setStatus('CONFIRMED')
    useExportListFilter.getState().reset()
    expect(useExportListFilter.getState().status).toBeNull()
  })
})
