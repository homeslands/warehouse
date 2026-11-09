// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import type {
  NativeStackHeaderItem,
  NativeStackHeaderItemButton,
  NativeStackNavigationOptions,
} from 'expo-router'
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect'
import { Platform, StyleSheet } from 'react-native'

import type { ImportForm } from '@/entities/import-form'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { lightColors } from '@/shared/theme/tokens'

import { ImportListScreen } from './ImportListScreen'
import { resetImportListOnWarehouseChange, useImportListFilter } from './import-list.store'

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

const form = (over: Partial<ImportForm> = {}): ImportForm => ({
  slug: 'pn-1',
  createdAt: localAt(0, 9, 5),
  updatedAt: '2026-11-01T00:00:00.000Z',
  version: 1,
  code: 'PN-20261101-0900',
  purchaseOrder: 'PO-77',
  invoiceCode: 'HD-001',
  requesterSlug: 'u-1',
  requesterName: 'Nguyễn Văn An',
  approverSlug: null,
  approverName: null,
  date: '2026-11-01',
  total: 46176000,
  file: null,
  note: null,
  status: 'DRAFT',
  warehouseSlug: 'wh-a',
  ...over,
})

type Params = Record<string, unknown>
const seen: Params[] = []
const paged = (items: ImportForm[], page = 1, hasNext = false) =>
  ok({
    items,
    total: items.length,
    page,
    pageSize: 20,
    totalPages: 1,
    hasNext,
    hasPrevios: page > 1,
  })

function listRoute(handler: (p: Params) => ReturnType<typeof ok> = () => paged([form()])) {
  route('get', '/warehouses/wh-a/import-forms', (config) => {
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
const tick = () => act(async () => new Promise((r) => setTimeout(r, 0)))

async function show() {
  await render(
    <QueryClientProvider client={client}>
      <ImportListScreen />
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
  useImportListFilter.getState().reset()
  useWarehouseStore.setState({ current: WH_A, resolved: true, resolution: 'selected' })
  signIn(['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE'])
})

afterEach(() => {
  client.clear()
})

describe('ImportListScreen — danh sách', () => {
  it('mặc định gọi status=DRAFT; dòng: mã, "HĐ · PO · người tạo", tổng tiền, giờ HH:mm', async () => {
    listRoute()
    await show()
    expect(seen[0]).toMatchObject({ status: 'DRAFT', sort: 'DESC', page: 1 })
    expect(screen.getByText('PN-20261101-0900')).toBeOnTheScreen()
    expect(screen.getByText('HĐ HD-001 · PO PO-77 · Nguyễn Văn An')).toBeOnTheScreen()
    expect(norm(screen.getByText(/46\.176\.000/).props.children as string)).toBe('46.176.000 đ')
    expect(screen.getByText('09:05')).toBeOnTheScreen()
  })

  it('không có PO → dòng phụ chỉ "HĐ … · người tạo"', async () => {
    listRoute(() => paged([form({ purchaseOrder: null })]))
    await show()
    expect(screen.getByText('HĐ HD-001 · Nguyễn Văn An')).toBeOnTheScreen()
  })

  it('ô trạng thái: Tất cả · Nháp · Đã nhập · Đã huỷ, mặc định Nháp', async () => {
    listRoute()
    await show()
    for (const name of ['Tất cả', 'Nháp', 'Đã nhập', 'Đã huỷ'])
      expect(screen.getByRole('tab', { name })).toBeOnTheScreen()
    expect(screen.getByRole('tab', { name: 'Nháp' })).toBeSelected()
  })

  it('chọn "Đã nhập" → status=CONFIRMED', async () => {
    listRoute()
    await show()
    await act(async () => fireEvent.press(screen.getByRole('tab', { name: 'Đã nhập' })))
    await settled()
    expect(seen.at(-1)).toMatchObject({ status: 'CONFIRMED' })
  })

  it('"Tất cả" không gửi tham số status', async () => {
    listRoute()
    await show()
    await act(async () => fireEvent.press(screen.getByRole('tab', { name: 'Tất cả' })))
    await settled()
    expect(seen.at(-1)).not.toHaveProperty('status')
  })

  it('ô trạng thái hiện cả khi tiếng Anh: All · Draft · Received · Cancelled', async () => {
    await changeLanguage('en')
    try {
      listRoute()
      await show()
      for (const name of ['All', 'Draft', 'Received', 'Cancelled'])
        expect(screen.getByRole('tab', { name })).toBeOnTheScreen()
    } finally {
      await act(async () => changeLanguage('vi'))
    }
  })

  it('ô tile theo trạng thái: DRAFT / CONFIRMED / CANCELLED', async () => {
    listRoute(() =>
      paged([
        form({ slug: 'a', code: 'A', status: 'DRAFT' }),
        form({ slug: 'b', code: 'B', status: 'CONFIRMED' }),
        form({ slug: 'c', code: 'C', status: 'CANCELLED' }),
      ]),
    )
    await show()
    await act(async () => fireEvent.press(screen.getByRole('tab', { name: 'Tất cả' })))
    await settled()
    for (const st of ['DRAFT', 'CONFIRMED', 'CANCELLED'])
      expect(screen.getByTestId(`import-tile-${st}`)).toBeOnTheScreen()
  })

  it('nhãn truy cập của dòng: mã, trạng thái, HĐ, PO, người tạo, tổng, giờ', async () => {
    listRoute()
    await show()
    const row = screen.getByRole('button', { name: /PN-20261101-0900/ })
    const label = norm(row.props.accessibilityLabel as string)
    for (const part of [
      'PN-20261101-0900',
      'Nháp',
      'HĐ HD-001',
      'PO PO-77',
      'Nguyễn Văn An',
      '46.176.000 đ',
      '09:05',
    ])
      expect(label).toContain(part)
  })

  it('nhóm theo ngày: Hôm nay / Hôm qua, mỗi ngày một tiêu đề', async () => {
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
    expect(screen.getAllByTestId('import-row')).toHaveLength(3)
  })

  it('worst case: mã 32 ký tự, HĐ 64 ký tự, tổng ≥ 1e12 → mọi chữ một dòng, cột phải giữ độ rộng', async () => {
    listRoute(() =>
      paged([
        form({
          code: 'P'.repeat(32),
          invoiceCode: 'H'.repeat(64),
          total: 3.5e12,
        }),
      ]),
    )
    await show()
    const code = screen.getByText('P'.repeat(32))
    expect(code.props.numberOfLines).toBe(1)
    expect(screen.getByText(/H{64}/).props.numberOfLines).toBe(1)
    const total = screen.getByText(/3\.500\.000\.000\.000/)
    expect(total.props.numberOfLines).toBe(1)
    expect(total.props.adjustsFontSizeToFit).toBe(true)
    const column = screen.getByTestId('import-row-end')
    expect(StyleSheet.flatten(column.props.style)).toMatchObject({ width: expect.any(Number) })
  })

  it('gõ "pn-26" (debounce 300ms) ở Mã phiếu → code=PN-26; đổi sang Số HĐ → invoiceCode=pn-26', async () => {
    listRoute()
    await show()
    expect(screen.queryByRole('tab', { name: 'Số HĐ' })).toBeNull()
    await act(async () => fireEvent.changeText(screen.getByLabelText(SEARCH_LABEL), 'pn-26'))
    const before = seen.length
    await waitDebounce(150)
    expect(seen).toHaveLength(before)
    await typeSearch('pn-26')
    expect(seen.at(-1)).toMatchObject({ code: 'PN-26', status: 'DRAFT' })
    await act(async () => fireEvent.press(screen.getByRole('tab', { name: 'Số HĐ' })))
    await settled()
    expect(seen.at(-1)).toMatchObject({ invoiceCode: 'pn-26' })
    expect(seen.at(-1)).not.toHaveProperty('code')
  })

  it('cuộn tới cuối → trang 2 đúng một lần (kể cả bắn onEndReached hai lần)', async () => {
    listRoute((p) =>
      p.page === 2
        ? paged([form({ slug: 'pn-2', code: 'PN-2' })], 2, false)
        : paged([form()], 1, true),
    )
    await show()
    const list = screen.getByTestId('import-list')
    await fireEvent(list, 'endReached')
    await fireEvent(list, 'endReached')
    await settled()
    expect(seen.filter((p) => p.page === 2)).toHaveLength(1)
    expect(screen.getByText('PN-2')).toBeOnTheScreen()
    await fireEvent(list, 'endReached')
    await settled()
    expect(seen.filter((p) => p.page === 2)).toHaveLength(1)
  })

  it('chạm dòng → push đúng formSlug', async () => {
    listRoute()
    await show()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: /PN-20261101-0900/ })))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/import/[formSlug]',
      params: { formSlug: 'pn-1' },
    })
  })

  it('danh sách rỗng → "Chưa có phiếu nhập"; có tìm kiếm mà rỗng → "Không tìm thấy phiếu"', async () => {
    listRoute(() => paged([]))
    await show()
    expect(screen.getByText('Chưa có phiếu nhập')).toBeOnTheScreen()
    await typeSearch('zz')
    expect(screen.getByText('Không tìm thấy phiếu')).toBeOnTheScreen()
  })

  it('lỗi lần đầu → EmptyState + Thử lại; thử lại được', async () => {
    let fail = true
    listRoute(() => (fail ? failure(500, 100001) : paged([form()])))
    await show()
    expect(screen.getByText('Không tải được phiếu nhập')).toBeOnTheScreen()
    fail = false
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Thử lại' })))
    await settled()
    expect(screen.getByText('PN-20261101-0900')).toBeOnTheScreen()
  })

  it('làm mới lỗi khi đã có dữ liệu → ErrorBanner, giữ dòng cũ', async () => {
    listRoute()
    await show()
    route('get', '/warehouses/wh-a/import-forms', () => 'network')
    const [pull] = screen.container.queryAll((n) => n.type === 'RCTRefreshControl')
    await fireEvent(pull, 'refresh')
    await settled()
    expect(screen.getByText('Không làm mới được danh sách')).toBeOnTheScreen()
    expect(screen.getByText('PN-20261101-0900')).toBeOnTheScreen()
  })
})

describe('ImportListScreen — header & nút nổi tạo phiếu', () => {
  const original = Platform.OS
  afterEach(() => {
    Platform.OS = original
    ;(isLiquidGlassAvailable as jest.Mock).mockReset()
    ;(isLiquidGlassAvailable as jest.Mock).mockReturnValue(false)
    ;(isGlassEffectAPIAvailable as jest.Mock).mockReset()
    ;(isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(false)
  })

  const fab = () => screen.getByRole('button', { name: 'Tạo phiếu nhập' })

  it('iOS: KHÔNG dùng ô tìm native (nháy khi đổi tab, iOS 26); KHÔNG có nút "+" trên header', async () => {
    Platform.OS = 'ios'
    listRoute()
    await show()
    expect(mockHeader.options.headerSearchBarOptions).toBeUndefined()
    expect(screen.getByLabelText(SEARCH_LABEL)).toBeOnTheScreen()
    // Bên phải chỉ có [Lọc, khoảng, kho] — không có "+" (tạo phiếu là nút nổi).
    expect(rightItems().map((i) => i.type)).toEqual(['button', 'spacing', 'custom'])
    expect(mockHeader.options.headerRight).toBeUndefined()
  })

  it('iOS: render lại vì state khác (trạng thái, chữ tìm) KHÔNG dựng lại options của header', async () => {
    Platform.OS = 'ios'
    listRoute()
    await show()
    const before = mockHeader.options
    await act(async () => useImportListFilter.getState().setStatus('CONFIRMED'))
    await settled()
    await act(async () => useImportListFilter.getState().setQuery('x'))
    expect(mockHeader.options).toBe(before)
  })

  it('có IMPORT_FORM_CREATE: nút nổi "Tạo phiếu nhập" → luôn navigate modal /import-form/new/info (bước 1 tự mở lại bản nháp)', async () => {
    listRoute()
    await show()
    await act(async () => fireEvent.press(fab()))
    await settled()
    // `navigate` (không `push`): bấm "+" hai lần liền vẫn chỉ một modal (xem routing.test).
    expect(mockNavigate).toHaveBeenCalledWith('/import-form/new/info')
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('không có IMPORT_FORM_CREATE → không có nút nổi', async () => {
    signIn(['IMPORT_FORM_READ'])
    listRoute()
    await show()
    expect(screen.queryByRole('button', { name: 'Tạo phiếu nhập' })).toBeNull()
  })

  it('Liquid Glass có sẵn → dùng GlassView; không có → thẻ mờ thường (không GlassView)', async () => {
    listRoute()
    ;(isLiquidGlassAvailable as jest.Mock).mockReturnValue(true)
    ;(isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(true)
    await show()
    expect(within(fab()).getByTestId('glass-view')).toBeOnTheScreen()
    // Kính tô xanh dương hệ thống, icon trắng.
    expect(within(fab()).getByTestId('glass-view').props.tintColor).toBe(lightColors.accent)
    await screen.unmount()
    ;(isLiquidGlassAvailable as jest.Mock).mockReturnValue(false)
    await show()
    expect(within(fab()).queryByTestId('glass-view')).toBeNull()
    expect(within(fab()).getByTestId('fab-fallback')).toBeOnTheScreen()
    // Dự phòng: nền xanh dương hệ thống đặc.
    expect(within(fab()).getByTestId('fab-fallback')).toHaveStyle({
      backgroundColor: lightColors.accent,
    })
  })

  it('Liquid Glass có nhưng isGlassEffectAPIAvailable() false (iOS 26 lỗi) → dùng thẻ mờ', async () => {
    listRoute()
    ;(isLiquidGlassAvailable as jest.Mock).mockReturnValue(true)
    ;(isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(false)
    await show()
    expect(within(fab()).queryByTestId('glass-view')).toBeNull()
    expect(within(fab()).getByTestId('fab-fallback')).toBeOnTheScreen()
  })

  it('GlassView: khi nhấn KHÔNG có opacity < 1 hay scale trên GlassView và các view cha', async () => {
    listRoute()
    ;(isLiquidGlassAvailable as jest.Mock).mockReturnValue(true)
    ;(isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(true)
    await show()
    await fireEvent(fab(), 'pressIn')
    let node: typeof fab extends () => infer R ? R | null : never =
      within(fab()).getByTestId('glass-view')
    while (node && node.type !== 'RNCSafeAreaView') {
      const style = StyleSheet.flatten(node.props.style) ?? {}
      expect(style.opacity ?? 1).toBe(1)
      expect(style.transform).toBeUndefined()
      node = node.parent
    }
  })

  it('Android: vùng chứa nút nổi KHÔNG đệm đáy theo safe area; danh sách chừa chỗ ≥ nút + khoảng hở', async () => {
    Platform.OS = 'android'
    listRoute()
    await show()
    const container = screen.getByTestId('fab-container')
    expect(container.type).toBe('View')
    const list = screen.getByTestId('import-list')
    const pad = StyleSheet.flatten(list.props.contentContainerStyle).paddingBottom as number
    expect(pad).toBeGreaterThanOrEqual(52 + 12)
  })

  it('iOS 26+ (kính): lề phải nút nổi 20pt = mép viên tab kính; không kính: 16pt = lề nội dung', async () => {
    Platform.OS = 'ios'
    listRoute()
    ;(isLiquidGlassAvailable as jest.Mock).mockReturnValue(true)
    ;(isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(true)
    await show()
    expect(screen.getByTestId('fab-container')).toHaveStyle({ paddingRight: 20 })
    await screen.unmount()
    ;(isLiquidGlassAvailable as jest.Mock).mockReturnValue(false)
    await show()
    expect(screen.getByTestId('fab-container')).toHaveStyle({ paddingRight: 16 })
  })

  it('iOS: vùng chứa nút nổi là SafeAreaView cạnh đáy', async () => {
    Platform.OS = 'ios'
    listRoute()
    await show()
    expect(screen.getByTestId('fab-container').type).toBe('RNCSafeAreaView')
  })

  it('Android: nút nổi cũng có (icon lucide), mở modal /import-form/new/info', async () => {
    Platform.OS = 'android'
    listRoute()
    await show()
    await act(async () => fireEvent.press(fab()))
    await settled()
    expect(mockNavigate).toHaveBeenCalledWith('/import-form/new/info')
  })
})

describe('ImportListScreen — đổi kho', () => {
  let off: () => void
  beforeEach(() => (off = resetImportListOnWarehouseChange()))
  afterEach(() => off())

  it('đổi kho → ô tìm kiếm được xoá, store về trống, không còn thẻ kho cũ', async () => {
    listRoute()
    route('get', '/warehouses/wh-b/import-forms', () =>
      paged([form({ slug: 'pn-b', code: 'PN-B-1', warehouseSlug: 'wh-b' })]),
    )
    await show()
    await typeSearch('pn')
    expect(screen.getByLabelText(SEARCH_LABEL).props.value).toBe('pn')
    expect(useImportListFilter.getState().query).toBe('pn')
    await act(async () => useWarehouseStore.setState({ current: WH_B }))
    expect(screen.queryByText('PN-20261101-0900')).toBeNull()
    expect(useImportListFilter.getState().query).toBe('')
    expect(screen.getByLabelText(SEARCH_LABEL).props.value).toBe('')
    await settled()
    await tick()
    expect(screen.getByText('PN-B-1')).toBeOnTheScreen()
    expect(callsTo('get', '/warehouses/wh-b/import-forms').length).toBeGreaterThan(0)
  })
})

describe.each(['ios', 'android'] as const)(
  'ImportListScreen — %s: ô tìm kiếm trong danh sách',
  (os) => {
    const original = Platform.OS
    beforeEach(() => {
      Platform.OS = os
    })
    afterEach(() => {
      Platform.OS = original
    })

    it('không dùng headerSearchBarOptions; ô tìm là mục đầu của danh sách, gõ → store → gọi API (debounce)', async () => {
      listRoute()
      await show()
      expect(mockHeader.options.headerSearchBarOptions).toBeUndefined()
      const field = screen.getByLabelText(SEARCH_LABEL)
      expect(field.props).toMatchObject({
        returnKeyType: 'search',
        autoCapitalize: 'none',
        autoCorrect: false,
      })
      // Mục đầu của ListHeader: nằm TRƯỚC ô trạng thái.
      const order = screen.container
        .queryAll(
          (n) => n.props.accessibilityLabel === SEARCH_LABEL || n.props.testID === 'import-status',
        )
        .map((n) => n.props.testID ?? 'search')
      expect(order[0]).toBe('search')
      await act(async () => fireEvent.changeText(field, 'pn-26'))
      expect(useImportListFilter.getState().query).toBe('pn-26')
      await waitDebounce(320)
      await settled()
      expect(seen.at(-1)).toMatchObject({ code: 'PN-26' })
      // Có chữ → hiện ô chọn trường.
      expect(screen.getByRole('tab', { name: 'Số HĐ' })).toBeOnTheScreen()
    })

    it('nút xoá → ô trống, store trống; store bị xoá từ nơi khác (đổi kho) → ô trống theo', async () => {
      listRoute()
      await show()
      await act(async () => useImportListFilter.getState().setQuery('pn'))
      expect(screen.getByLabelText(SEARCH_LABEL).props.value).toBe('pn')
      await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Xoá tìm kiếm' })))
      expect(useImportListFilter.getState().query).toBe('')
      await act(async () => useImportListFilter.getState().setQuery('hd'))
      await act(async () => useImportListFilter.getState().clearSearch())
      expect(screen.getByLabelText(SEARCH_LABEL).props.value).toBe('')
    })
  },
)

describe('ImportListScreen — nút "Lọc" trên header + dòng tóm tắt bộ lọc', () => {
  const original = Platform.OS
  afterEach(() => {
    Platform.OS = original
  })

  const summary = () => screen.queryByTestId('filter-summary')

  it('iOS: mục "Lọc" (button, không menu) trước nút kho; viền khi chưa lọc → mở /import-filter', async () => {
    Platform.OS = 'ios'
    listRoute()
    await show()
    expect(filterItem()).toMatchObject({
      type: 'button',
      label: 'Lọc',
      accessibilityLabel: 'Lọc',
      icon: { type: 'sfSymbol', name: 'line.3.horizontal.decrease.circle' },
    })
    expect(rightItems().some((i) => i.type === 'menu')).toBe(false)
    await act(async () => filterItem().onPress())
    expect(mockNavigate).toHaveBeenLastCalledWith('/import-filter')
  })

  it('iOS: đang lọc → icon đặc, nhãn "Lọc, đang lọc"', async () => {
    Platform.OS = 'ios'
    useImportListFilter.setState({ time: 'today' })
    listRoute()
    await show()
    expect(filterItem()).toMatchObject({
      accessibilityLabel: 'Lọc, đang lọc',
      icon: { type: 'sfSymbol', name: 'line.3.horizontal.decrease.circle.fill' },
    })
  })

  it('Android: nút "Lọc" phẳng 44pt trước nút kho → mở /import-filter; đang lọc → "Lọc, đang lọc"', async () => {
    Platform.OS = 'android'
    listRoute()
    await show()
    expect(mockHeader.options.unstable_headerRightItems).toBeUndefined()
    const header = await render(
      mockHeader.options.headerRight!({ canGoBack: false } as never) as never,
    )
    const button = header.getByRole('button', { name: 'Lọc' })
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({ width: 44, height: 44 })
    await fireEvent.press(button)
    expect(mockNavigate).toHaveBeenLastCalledWith('/import-filter')
    await header.unmount()

    await act(async () => useImportListFilter.setState({ time: 'today' }))
    const active = await render(
      mockHeader.options.headerRight!({ canGoBack: false } as never) as never,
    )
    expect(active.getByRole('button', { name: 'Lọc, đang lọc' })).toBeOnTheScreen()
  })

  it('không còn hàng chip; chưa lọc → không có dòng tóm tắt', async () => {
    listRoute()
    await show()
    expect(screen.queryByTestId('import-filter-chips')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Thời gian' })).toBeNull()
    expect(summary()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Xoá lọc' })).toBeNull()
  })

  it('đang lọc: dòng tóm tắt nối giá trị có hiệu lực bằng " · " và gửi tham số', async () => {
    signIn(['IMPORT_FORM_READ', 'USER_READ'])
    useImportListFilter.setState({
      time: 'last7',
      requester: { slug: 'u-1', name: 'An' },
      approver: { slug: 'u-9', name: 'Trần Thị Bình' },
    })
    listRoute()
    await show()
    expect(screen.getByText('7 ngày qua · Phiếu của tôi · Trần Thị Bình')).toBeOnTheScreen()
    expect(screen.getByText('7 ngày qua · Phiếu của tôi · Trần Thị Bình').props.numberOfLines).toBe(
      1,
    )
    const p = seen.at(-1)!
    expect(p).toMatchObject({ requesterSlug: 'u-1', approverSlug: 'u-9', status: 'DRAFT' })
    expect(p.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(p.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('người xác nhận là mình → "Tôi xác nhận"; khoảng tự chọn → "dd/MM – dd/MM"', async () => {
    signIn(['IMPORT_FORM_READ', 'USER_READ'])
    const year = new Date().getFullYear()
    useImportListFilter.setState({
      approver: { slug: 'u-1', name: 'An' },
      time: { from: `${year}-03-01`, to: `${year}-03-15` },
    })
    listRoute()
    await show()
    expect(screen.getByText('01/03 – 15/03 · Tôi xác nhận')).toBeOnTheScreen()
    expect(seen.at(-1)).toMatchObject({ startDate: `${year}-03-01`, endDate: `${year}-03-15` })
  })

  it('chạm dòng tóm tắt (vùng chạm ≥ 44 theo chiều cao) → mở /import-filter', async () => {
    useImportListFilter.setState({ time: 'today' })
    listRoute()
    await show()
    const line = screen.getByRole('button', { name: 'Bộ lọc: Hôm nay' })
    const { minHeight } = StyleSheet.flatten(line.props.style) as { minHeight: number }
    const slop = (line.props.hitSlop ?? { top: 0, bottom: 0 }) as { top: number; bottom: number }
    expect(minHeight + slop.top + slop.bottom).toBeGreaterThanOrEqual(44)
    await act(async () => fireEvent.press(line))
    expect(mockNavigate).toHaveBeenLastCalledWith('/import-filter')
  })

  it('mất USER_READ: người khác đã chọn không gửi, không có dòng tóm tắt, nút Lọc không đặc', async () => {
    useImportListFilter.setState({ requester: { slug: 'u-9', name: 'Bình' } })
    listRoute()
    await show()
    expect(seen.at(-1)).not.toHaveProperty('requesterSlug')
    expect(summary()).toBeNull()
    expect(filterItem().accessibilityLabel).toBe('Lọc')
  })

  it('✕ trên dòng tóm tắt (vùng chạm ≥ 44) → bỏ thời gian + người, GIỮ ô tìm kiếm và trạng thái', async () => {
    signIn(['IMPORT_FORM_READ', 'USER_READ'])
    useImportListFilter.setState({
      status: 'CONFIRMED',
      query: 'pn',
      time: 'today',
      requester: { slug: 'u-9', name: 'Bình' },
      approver: { slug: 'u-1', name: 'An' },
    })
    listRoute()
    await show()
    const clear = screen.getByRole('button', { name: 'Xoá lọc' })
    const { width, height } = StyleSheet.flatten(clear.props.style) as {
      width: number
      height: number
    }
    const slop = clear.props.hitSlop as { top: number; bottom: number; left: number; right: number }
    expect(width + slop.left + slop.right).toBeGreaterThanOrEqual(44)
    expect(height + slop.top + slop.bottom).toBeGreaterThanOrEqual(44)
    await act(async () => fireEvent.press(clear))
    await settled()
    expect(useImportListFilter.getState()).toMatchObject({
      status: 'CONFIRMED',
      query: 'pn',
      time: null,
      requester: null,
      approver: null,
    })
    expect(summary()).toBeNull()
    const p = seen.at(-1)!
    expect(p).toMatchObject({ status: 'CONFIRMED', code: 'PN' })
    for (const key of ['startDate', 'endDate', 'requesterSlug', 'approverSlug'])
      expect(p).not.toHaveProperty(key)
  })

  it('đổi kho GIỮ bộ lọc (chỉ xoá ô tìm kiếm)', async () => {
    const off = resetImportListOnWarehouseChange()
    try {
      useImportListFilter.setState({ query: 'pn', time: 'last30' })
      await act(async () => useWarehouseStore.setState({ current: WH_B }))
      expect(useImportListFilter.getState()).toMatchObject({ query: '', time: 'last30' })
    } finally {
      off()
    }
  })

  it('rỗng + có bộ lọc → "Không có phiếu khớp bộ lọc" + nút Xoá lọc (ưu tiên hơn câu tìm kiếm)', async () => {
    useImportListFilter.setState({ time: 'today', query: 'zz' })
    listRoute(() => paged([]))
    await show()
    await waitDebounce(320)
    await settled()
    expect(screen.getByText('Không có phiếu khớp bộ lọc')).toBeOnTheScreen()
    expect(screen.queryByText('Không tìm thấy phiếu')).toBeNull()
    // ✕ của dòng tóm tắt + nút trong trạng thái rỗng.
    const clearButtons = screen.getAllByRole('button', { name: 'Xoá lọc' })
    expect(clearButtons).toHaveLength(2)
    await act(async () => fireEvent.press(clearButtons[1]))
    await settled()
    expect(useImportListFilter.getState().time).toBeNull()
    expect(screen.getByText('Không tìm thấy phiếu')).toBeOnTheScreen()
  })
})
