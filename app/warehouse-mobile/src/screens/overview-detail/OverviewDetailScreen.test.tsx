// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import { AppState } from 'react-native'
import { GestureHandlerRootView, State } from 'react-native-gesture-handler'
import {
  createGestureController,
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils'

import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { usePeriodStore } from '@/features/overview-period'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { OverviewDetailScreen } from './OverviewDetailScreen'

const mockNavigate = jest.fn()
const mockPush = jest.fn()
const mockParams: { current: Record<string, string | undefined> } = { current: {} }
const mockHeader: { options?: { title?: string } } = {}
const mockFocused = { current: true }
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react')
  return {
    useRouter: () => ({ navigate: mockNavigate, push: mockPush }),
    useLocalSearchParams: () => mockParams.current,
    useIsFocused: () => mockFocused.current,
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(() => effect(), [effect])
    },
    Stack: {
      Screen: ({ options }: { options: { title?: string } }) => {
        mockHeader.options = options
        return null
      },
    },
  }
})

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const page = (items: object[], total = items.length, hasNext = false) =>
  ok({ items, total, page: 1, pageSize: 100, totalPages: 1, hasNext, hasPrevios: false })
type Reply = ReturnType<typeof page>

let client: QueryClient

const setUser = (scope: string[], roleName = 'STAFF') =>
  useAuthStore.setState({ user: { userName: 'Thắng', roleName, scope } } as never)

/** Chờ hết request đang chạy. */
const settle = () =>
  act(async () => {
    const tick = () => new Promise((r) => setTimeout(r, 0))
    await tick()
    for (let n = 0; n < 100 && client.isFetching() > 0; n++) await tick()
    await tick()
  })

async function show(metric: string) {
  mockParams.current = { metric }
  await render(
    <GestureHandlerRootView>
      <QueryClientProvider client={client}>
        <OverviewDetailScreen />
      </QueryClientProvider>
    </GestureHandlerRootView>,
  )
  await settle()
}

const importUrl = '/warehouses/wh-a/import-forms'
const exportUrl = '/warehouses/wh-a/export-forms'
type Params = { status?: string; startDate?: string; endDate?: string }
const reqs: { url: string; params: Params }[] = []
const rangeOf = (p: Params) => `${p.startDate}..${p.endDate}`
const formsApi =
  (url: string, period: (range: string) => Reply) => (config: { params?: Params }) => {
    const p = config.params ?? {}
    reqs.push({ url, params: p })
    return period(rangeOf(p))
  }
const periodRanges = (url: string) =>
  reqs.filter((r) => r.url === url).map((r) => rangeOf(r.params))

const imp = (slug: string, createdAt: string, total: number) => ({
  slug,
  code: `PN-${slug}`,
  createdAt,
  total,
  requesterName: 'An',
})
const exp = (slug: string, createdAt: string, totalAmount: number) => ({
  slug,
  code: `PX-${slug}`,
  createdAt,
  totalAmount,
  receiver: 'Bình',
})

const MONTH = '2026-11-01..2026-11-12'
const PREV_MONTH = '2026-10-01..2026-10-12'
const DAY = '2026-11-12..2026-11-12'
const YEAR = '2026-01-01..2026-11-12'

/** Tháng 11: 4 phiếu nhập = 3.104.400 đ (06/11 lớn nhất 2.100.000 đ). Tháng 10 (tới 12/10): 2.000.000 đ. */
const IMPORTS_NOV = [
  imp('n1', '2026-11-01T09:00:00', 204_400),
  imp('n2', '2026-11-06T10:00:00', 2_100_000),
  imp('n3', '2026-11-08T11:00:00', 320_000),
  imp('n4', '2026-11-10T14:00:00', 480_000),
]
const IMPORTS_TODAY = [
  imp('d1', '2026-11-12T07:30:00', 100_000),
  imp('d2', '2026-11-12T08:10:00', 50_000),
]
const importPeriods = (range: string) =>
  page(
    range === MONTH
      ? IMPORTS_NOV
      : range === PREV_MONTH
        ? [imp('o1', '2026-10-05T09:00:00', 2_000_000)]
        : range === DAY
          ? IMPORTS_TODAY
          : range === YEAR
            ? IMPORTS_NOV
            : [],
  )
const exportPeriods = (range: string) =>
  page(range === MONTH ? [exp('x1', '2026-11-09T09:00:00', 4_440)] : [])

const has = (testID: string, text: string | RegExp) =>
  expect(screen.getByTestId(testID)).toHaveTextContent(text, { exact: false })
const lacks = (testID: string, text: string | RegExp) =>
  expect(screen.getByTestId(testID)).not.toHaveTextContent(text, { exact: false })
const rows = () => screen.queryAllByTestId(/^detail-form-/).map((n) => n.props.testID as string)
const bars = () => screen.queryAllByTestId(/^bar-[^-]+(-\d+)*$/).map((n) => n.props.testID)

const FAKE_DATE_ONLY: Parameters<typeof jest.useFakeTimers>[0] = {
  doNotFake: [
    'hrtime',
    'nextTick',
    'performance',
    'queueMicrotask',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'requestIdleCallback',
    'cancelIdleCallback',
    'setImmediate',
    'clearImmediate',
    'setInterval',
    'clearInterval',
    'setTimeout',
    'clearTimeout',
  ],
}

const pickPeriod = async (name: string) => {
  await fireEvent.press(within(screen.getByTestId('period-seg')).getByRole('tab', { name }))
  await settle()
}

const fullUser = (imports = importPeriods, exports = exportPeriods) => {
  setUser([], 'SUPER_ADMIN')
  route('get', importUrl, formsApi(importUrl, imports) as never)
  route('get', exportUrl, formsApi(exportUrl, exports) as never)
}

/** Biểu đồ rộng 300: chạm `x` → ô `floor(x / 300 * số ô)`. */
const layoutPlot = () =>
  fireEvent(screen.getByTestId('detail-plot'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 180 } },
  })

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  jest.useFakeTimers(FAKE_DATE_ONLY)
  // Thứ Năm 12/11/2026 08:45.
  jest.setSystemTime(new Date(2026, 10, 12, 8, 45))
  jest.clearAllMocks()
  resetFakeApi()
  reqs.length = 0
  delete mockHeader.options
  mockFocused.current = true
  usePeriodStore.getState().reset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
})

afterEach(() => {
  client.clear()
  jest.useRealTimers()
})

describe('OverviewDetailScreen — Nhập kho', () => {
  it('tiêu đề, TỔNG đầy đủ, dòng phụ (khoảng ngày · 4 phiếu · ▲ % so tháng 10)', async () => {
    fullUser()
    await show('import')
    expect(mockHeader.options?.title).toBe('Nhập kho')
    has('detail-caps', 'TỔNG')
    has('detail-total-value', '3.104.400 đ')
    has('detail-sub', '1–12 thg 11, 2026')
    has('detail-sub', '4 phiếu')
    has('detail-sub', '▲ 55% so tháng 10')
    // Chỉ request nhập (kỳ + kỳ so sánh), không request xuất.
    expect([...new Set(periodRanges(importUrl))].sort()).toEqual([PREV_MONTH, MONTH])
    expect(periodRanges(exportUrl)).toEqual([])
  })

  it('biểu đồ Tháng: 30 cột, đường TB/ngày, nổi bật đúng ngày lớn nhất', async () => {
    fullUser()
    await show('import')
    expect(bars()).toHaveLength(30)
    expect(bars()[0]).toBe('bar-2026-11-01')
    expect(bars()[29]).toBe('bar-2026-11-30')
    // TB = 3.104.400 / 12 ngày đã qua = 258.700 đ.
    has('detail-avg', 'TB/ngày 258.700 đ')
    has('detail-highlight', 'Ngày nhập nhiều nhất là 06/11 với 2,1 tr đ')
    has('detail-highlight', 'gấp 8 lần trung bình mỗi ngày')
  })

  it('danh sách xếp theo tiền giảm dần; chạm dòng → /import/[formSlug]', async () => {
    fullUser()
    await show('import')
    expect(rows()).toEqual([
      'detail-form-import-n2',
      'detail-form-import-n4',
      'detail-form-import-n3',
      'detail-form-import-n1',
    ])
    has('detail-form-import-n2', 'PN-n2')
    has('detail-form-import-n2', '06/11 · An')
    has('detail-form-import-n2', '2.100.000 đ')
    await fireEvent.press(screen.getByTestId('detail-form-import-n3'))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/import/[formSlug]',
      params: { formSlug: 'n3' },
    })
  })

  it('> 20 phiếu: 20 dòng + "Xem thêm" → hiện thêm', async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      imp(`m${i}`, `2026-11-0${(i % 9) + 1}T09:00:00`, 1000 + i),
    )
    fullUser((range) => page(range === MONTH ? many : []))
    await show('import')
    expect(rows()).toHaveLength(20)
    // Tiền lớn nhất trước.
    expect(rows()[0]).toBe('detail-form-import-m24')
    expect(screen.getByTestId('detail-more')).toHaveTextContent('Xem thêm (5)')
    await fireEvent.press(screen.getByTestId('detail-more'))
    expect(rows()).toHaveLength(25)
    expect(screen.queryByTestId('detail-more')).toBeNull()
  })

  it('đổi sang "Ngày" trong chi tiết: 24 cột, TB/giờ; kỳ của Tóm tắt không đổi', async () => {
    fullUser()
    await show('import')
    await pickPeriod('Ngày')
    has('period-label', 'Hôm nay')
    expect(bars()).toHaveLength(24)
    expect(bars()[0]).toBe('bar-00')
    // 150.000 đ / 9 giờ đã qua (00..08) = 16.667 đ.
    has('detail-avg', 'TB/giờ 16.667 đ')
    has('detail-total-value', '150.000 đ')
    expect(usePeriodStore.getState()).toMatchObject({ period: 'month', offset: 0 })
    // Lùi một kỳ cũng chỉ ở trong chi tiết.
    await fireEvent.press(screen.getByTestId('period-back'))
    await settle()
    has('period-label', 'Hôm qua')
    expect(usePeriodStore.getState()).toMatchObject({ period: 'month', offset: 0 })
  })

  it('mở với kỳ + độ lùi đang chọn ở Tóm tắt', async () => {
    usePeriodStore.getState().setPeriod('year')
    fullUser()
    await show('import')
    has('period-label', 'Năm 2026')
    expect(periodRanges(importUrl)).toContain(YEAR)
    expect(bars()).toHaveLength(12)
    // 3.104.400 đ / 11 tháng đã qua.
    has('detail-avg', 'TB/tháng 282.218 đ')
    has('detail-highlight', 'Tháng nhập nhiều nhất là tháng 11')
  })

  it('chạm cột → dòng tổng đổi sang giá trị cột; chạm lại → về tổng', async () => {
    fullUser()
    await show('import')
    await layoutPlot()
    const tap = getByGestureTestId('detail-tap')
    // x = 55 → ô 5 = 06/11.
    await act(async () =>
      fireGestureHandler(tap, [
        { state: State.BEGAN, x: 55, y: 10 },
        { state: State.ACTIVE, x: 55, y: 10 },
        { state: State.END, x: 55, y: 10 },
      ]),
    )
    has('detail-total-value', '2.100.000 đ')
    has('detail-sub', 'Thứ Sáu, 06/11')
    has('detail-sub', '1 phiếu')
    await act(async () =>
      fireGestureHandler(tap, [
        { state: State.BEGAN, x: 55, y: 10 },
        { state: State.ACTIVE, x: 55, y: 10 },
        { state: State.END, x: 55, y: 10 },
      ]),
    )
    has('detail-total-value', '3.104.400 đ')
  })

  it('kéo ngang chọn cột theo vị trí; thả tay → về tổng', async () => {
    fullUser()
    await show('import')
    await layoutPlot()
    const pan = createGestureController(getByGestureTestId('detail-pan'))
    await act(async () => {
      pan.begin({ x: 5, y: 10 })
      pan.activate({ x: 5, y: 10 })
      pan.update({ x: 75, y: 10 })
    })
    // x = 75 → ô 7 = 08/11.
    has('detail-total-value', '320.000 đ')
    await act(async () => pan.end({ x: 75, y: 10 }))
    has('detail-total-value', '3.104.400 đ')
  })

  it('chạm ô chưa tới (sau hôm nay) → chọn hôm nay', async () => {
    fullUser()
    await show('import')
    await layoutPlot()
    await act(async () =>
      fireGestureHandler(getByGestureTestId('detail-tap'), [
        { state: State.BEGAN, x: 290, y: 10 },
        { state: State.ACTIVE, x: 290, y: 10 },
        { state: State.END, x: 290, y: 10 },
      ]),
    )
    has('detail-sub', 'Thứ Năm, 12/11')
    has('detail-total-value', '0 đ')
  })

  it('kỳ không có phiếu: không "Nổi bật", danh sách trống có chữ trạng thái', async () => {
    fullUser(() => page([]))
    await show('import')
    has('detail-total-value', '0 đ')
    expect(screen.queryByTestId('detail-highlight')).toBeNull()
    expect(screen.queryByText('Nổi bật')).toBeNull()
    has('detail-empty', 'Không có phiếu nào trong kỳ này')
    expect(rows()).toEqual([])
    expect(screen.queryByTestId('detail-avg')).toBeNull()
  })

  it('vượt trần: tổng "–" + chú thích, biểu đồ "–", không danh sách / nổi bật', async () => {
    fullUser((range) =>
      range === YEAR ? page([imp('y', '2026-03-01T09:00:00', 5_000)], 1, true) : page([]),
    )
    usePeriodStore.getState().setPeriod('year')
    await show('import')
    has('detail-total-value', '–')
    has('detail-summary', 'quá nhiều phiếu để tính')
    lacks('detail-total-value', /\d/)
    expect(bars()).toEqual([])
    has('detail-chart', '–')
    expect(screen.queryByTestId('detail-highlight')).toBeNull()
    expect(rows()).toEqual([])
    has('detail-list-note', 'quá nhiều phiếu')
  })

  it('lỗi: "!" + kéo xuống để thử lại; kéo làm mới → có số', async () => {
    let fail = true
    setUser([], 'SUPER_ADMIN')
    route('get', importUrl, ((config: { params?: Params }) => {
      reqs.push({ url: importUrl, params: config.params ?? {} })
      return fail ? failure(500) : importPeriods(rangeOf(config.params ?? {}))
    }) as never)
    await show('import')
    expect(screen.getByTestId('detail-total-error')).toHaveTextContent('!')
    has('detail-chart', 'Kéo xuống để thử lại')
    fail = false
    const control = screen.getByTestId('detail-scroll').props.refreshControl as {
      props: { onRefresh: () => void }
    }
    await act(async () => control.props.onRefresh())
    await settle()
    has('detail-total-value', '3.104.400 đ')
  })
})

describe('OverviewDetailScreen — Xuất kho', () => {
  it('tiêu đề Xuất kho, tổng xuất, chạm dòng → /export/[formSlug]', async () => {
    fullUser()
    await show('export')
    expect(mockHeader.options?.title).toBe('Xuất kho')
    has('detail-total-value', '4.440 đ')
    has('detail-sub', '1 phiếu')
    has('detail-sub', 'Tháng 10: 0 đ')
    has('detail-form-export-x1', '09/11 · Bình')
    await fireEvent.press(screen.getByTestId('detail-form-export-x1'))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/export/[formSlug]',
      params: { formSlug: 'x1' },
    })
    expect(periodRanges(importUrl)).toEqual([])
  })
})

describe('OverviewDetailScreen — Hoạt động', () => {
  it('SỐ PHIẾU, cột đôi, danh sách gộp theo ngày mới nhất; chạm phiếu xuất → /export/[formSlug]', async () => {
    fullUser()
    await show('activity')
    expect(mockHeader.options?.title).toBe('Hoạt động')
    has('detail-caps', 'SỐ PHIẾU')
    has('detail-total-value', '5 phiếu')
    has('detail-sub', '4 nhập · 1 xuất')
    expect(screen.getByTestId('bar-2026-11-06-import')).toBeOnTheScreen()
    expect(screen.getByTestId('bar-2026-11-06-export')).toBeOnTheScreen()
    expect(rows()).toEqual([
      'detail-form-import-n4',
      'detail-form-export-x1',
      'detail-form-import-n3',
      'detail-form-import-n2',
      'detail-form-import-n1',
    ])
    has('detail-form-export-x1', 'Xuất')
    has('detail-form-import-n4', 'Nhập')
    await fireEvent.press(screen.getByTestId('detail-form-export-x1'))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/export/[formSlug]',
      params: { formSlug: 'x1' },
    })
  })

  it('nổi bật theo số phiếu; chỉ IMPORT_FORM_READ → chỉ chuỗi nhập, không request xuất', async () => {
    setUser(['IMPORT_FORM_READ'])
    route('get', importUrl, formsApi(importUrl, importPeriods) as never)
    await show('activity')
    has('detail-total-value', '4 phiếu')
    expect(screen.queryByTestId('bar-2026-11-06-export')).toBeNull()
    expect(screen.getByTestId('bar-2026-11-06-import')).toBeOnTheScreen()
    has('detail-highlight', 'nhiều phiếu nhất')
    expect(periodRanges(exportUrl)).toEqual([])
  })
})

describe('OverviewDetailScreen — chặn mở', () => {
  it.each([
    ['metric lạ', 'foo', ['IMPORT_FORM_READ', 'EXPORT_FORM_READ']],
    ['xuất khi chỉ có quyền nhập', 'export', ['IMPORT_FORM_READ']],
    ['hoạt động khi không có quyền phiếu', 'activity', ['MATERIAL_READ']],
  ])('%s → về Tóm tắt, không request', async (_, metric, scope) => {
    setUser(scope)
    route('get', importUrl, formsApi(importUrl, importPeriods) as never)
    route('get', exportUrl, formsApi(exportUrl, exportPeriods) as never)
    await show(metric)
    expect(mockNavigate).toHaveBeenCalledWith('/overview')
    expect(reqs).toEqual([])
    expect(screen.queryByTestId('detail-total-value')).toBeNull()
  })
})

describe('OverviewDetailScreen — chuyển hướng chỉ khi đang xem + còn phiên', () => {
  it('đã đăng xuất (không có user) → không đẩy về Tóm tắt', async () => {
    useAuthStore.setState({ user: null } as never)
    await show('import')
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(reqs).toEqual([])
  })

  it('màn đang ở nền (mất focus) → không đẩy; có focus lại → về Tóm tắt', async () => {
    setUser(['MATERIAL_READ'])
    mockFocused.current = false
    await show('import')
    expect(mockNavigate).not.toHaveBeenCalled()
    mockFocused.current = true
    await screen.rerender(
      <GestureHandlerRootView>
        <QueryClientProvider client={client}>
          <OverviewDetailScreen />
        </QueryClientProvider>
      </GestureHandlerRootView>,
    )
    expect(mockNavigate).toHaveBeenCalledWith('/overview')
  })
})

describe('OverviewDetailScreen — làm mới khi foreground', () => {
  let onChange: ((state: string) => void) | undefined
  let spy: jest.SpyInstance
  beforeEach(() => {
    onChange = undefined
    spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      handler: (state: string) => void,
    ) => {
      onChange = handler
      return { remove: jest.fn() }
    }) as never)
  })
  afterEach(() => {
    // AppState.addEventListener đã là jest.fn của preset RN: trả lại bản vô hại thay vì restore.
    spy.mockImplementation((() => ({ remove: jest.fn() })) as never)
  })

  it('query đã cũ → tải lại; còn tươi thì không', async () => {
    setUser(['IMPORT_FORM_READ'])
    route('get', importUrl, formsApi(importUrl, importPeriods) as never)
    await show('import')
    expect(periodRanges(importUrl)).toHaveLength(2)
    await act(async () => onChange?.('active'))
    await settle()
    expect(periodRanges(importUrl)).toHaveLength(2)
    await act(async () => {
      await client.invalidateQueries({ refetchType: 'none' })
    })
    await act(async () => onChange?.('active'))
    await settle()
    expect(periodRanges(importUrl)).toHaveLength(4)
  })

  it('so sánh cắt ở lúc có số (09:00), không phải giờ vẽ lại (15:00)', async () => {
    jest.setSystemTime(new Date(2026, 10, 12, 9, 0))
    setUser(['IMPORT_FORM_READ'])
    let hang = false
    const inner = formsApi(importUrl, (range) =>
      page(
        range === MONTH
          ? [imp('c1', '2026-11-05T10:00:00', 2_000)]
          : range === PREV_MONTH
            ? [imp('p1', '2026-10-12T08:00:00', 1_000), imp('p2', '2026-10-12T12:00:00', 5_000)]
            : [],
      ),
    )
    route('get', importUrl, ((config: { params?: Params }) =>
      hang ? new Promise(() => {}) : inner(config)) as never)
    await show('import')
    has('detail-sub', '▲ 100% so tháng 10')
    hang = true
    jest.setSystemTime(new Date(2026, 10, 12, 15, 0))
    await act(async () => onChange?.('active'))
    has('detail-sub', '▲ 100% so tháng 10')
  })
})
