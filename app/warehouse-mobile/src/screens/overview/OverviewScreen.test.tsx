// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { calls, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import { AppState } from 'react-native'

import { item } from '@/entities/inventory/model/fixtures'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { usePeriodStore } from '@/features/overview-period'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { lightColors } from '@/shared/theme/tokens'

import { OverviewScreen } from './OverviewScreen'

const mockNavigate = jest.fn()
const mockPush = jest.fn()
type FocusEffect = () => void | (() => void)
const mockFocus: { active: Set<FocusEffect> } = { active: new Set() }
const refocus = () => act(async () => mockFocus.active.forEach((effect) => void effect()))
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react')
  return {
    useRouter: () => ({ navigate: mockNavigate, push: mockPush }),
    useFocusEffect: (effect: FocusEffect) => {
      useEffect(() => {
        mockFocus.active.add(effect)
        const undo = effect()
        return () => {
          mockFocus.active.delete(effect)
          undo?.()
        }
      }, [effect])
    },
  }
})

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const page = (items: object[], total = items.length, hasNext = false) =>
  ok({ items, total, page: 1, pageSize: 100, totalPages: 1, hasNext, hasPrevios: false })
type Reply = ReturnType<typeof page>

const INVENTORY = [
  item({ slug: 'a', quantity: 0, availableQuantity: 0, effectiveMinimumInventory: 10 }),
  item({ slug: 'b', quantity: 5, availableQuantity: 5, isBelowMinimum: true }),
  item({ slug: 'c', quantity: 90, availableQuantity: 90, isAboveMaximum: true }),
  item({ slug: 'd', quantity: 40, availableQuantity: 40 }),
]

let client: QueryClient

const setUser = (scope: string[], roleName = 'STAFF') =>
  useAuthStore.setState({ user: { userName: 'Thắng', roleName, scope } } as never)

/** Chờ hết request đang chạy (request treo thì dừng sau 100 nhịp). */
const settle = () =>
  act(async () => {
    const tick = () => new Promise((r) => setTimeout(r, 0))
    await tick()
    for (let n = 0; n < 100 && client.isFetching() > 0; n++) await tick()
    await tick()
  })

async function show() {
  await render(
    <QueryClientProvider client={client}>
      <OverviewScreen />
    </QueryClientProvider>,
  )
  await settle()
}

const importUrl = '/warehouses/wh-a/import-forms'
const exportUrl = '/warehouses/wh-a/export-forms'
type Params = {
  status?: string
  startDate?: string
  endDate?: string
  page?: number
  size?: number
}
/** Mọi request phiếu kèm params (fake-api không ghi params). */
const reqs: { url: string; params: Params }[] = []
/** `startDate..endDate` của request. */
const rangeOf = (p: Params) => `${p.startDate}..${p.endDate}`
type PeriodReply = (range: string) => Reply | 'hang'
/**
 * Request treo không hẹn giờ: `'hang'` của fake-api treo tới hết `timeout` 30s bằng hẹn giờ thật, giữ
 * worker jest sống sau khi test xong.
 */
const forever = () => new Promise<never>(() => {})

/**
 * Handler phiếu: đếm "việc cần làm" (`size=1`, theo `status`), phiếu đã xác nhận theo kỳ (`startDate`,
 * trả `period(range)`, mặc định rỗng), còn lại là tổng "đang chờ" (DRAFT / PENDING, không kỳ).
 */
const formsApi =
  (
    url: string,
    o: {
      counts?: Record<string, number | Reply>
      period?: PeriodReply
      pending?: object[] | Reply
    } = {},
  ) =>
  (config: { params?: Params }) => {
    const p = config.params ?? {}
    reqs.push({ url, params: p })
    if (p.size === 1) {
      const v = o.counts?.[p.status ?? ''] ?? 0
      return typeof v === 'number' ? page([], v) : v
    }
    if (p.startDate) {
      const reply = o.period ? o.period(rangeOf(p)) : page([])
      return reply === 'hang' ? forever() : reply
    }
    const pending = o.pending ?? []
    return Array.isArray(pending) ? page(pending) : pending
  }
const periodReqs = (url: string) =>
  reqs.filter((r) => r.url === url && r.params.status === 'CONFIRMED' && r.params.startDate)
const countReqsOf = () => reqs.filter((r) => r.params.size === 1)
const pendingReqs = (url: string) =>
  reqs.filter((r) => r.url === url && r.params.size !== 1 && !r.params.startDate)

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
const WEEK = '2026-11-09..2026-11-12'
const PREV_WEEK = '2026-11-02..2026-11-05'
const YEAR = '2026-01-01..2026-11-12'

/** Tháng 11: 4 phiếu nhập = 3.104.400 đ; 1 phiếu xuất 4.440 đ. Tháng 10 (tới 12/10 08:45): 2.000.000 đ nhập. */
const IMPORTS_NOV = [
  imp('n1', '2026-11-01T09:00:00', 204_400),
  imp('n2', '2026-11-06T10:00:00', 2_100_000),
  imp('n3', '2026-11-08T11:00:00', 320_000),
  imp('n4', '2026-11-10T14:00:00', 480_000),
]
const IMPORTS_OCT = [
  imp('o1', '2026-10-05T09:00:00', 2_000_000),
  // Sau 08:45 ngày 12/10 → ngoài kỳ so sánh.
  imp('o2', '2026-10-12T10:00:00', 999_999),
]
const importPeriods: PeriodReply = (range) =>
  page(range === MONTH ? IMPORTS_NOV : range === PREV_MONTH ? IMPORTS_OCT : [])
const exportPeriods: PeriodReply = (range) =>
  page(range === MONTH ? [exp('x1', '2026-11-08T09:00:00', 4_440)] : [])

const batchesUrl = '/warehouses/wh-a/material-batches'
type BatchParams = { status?: number; size?: number; page?: number; expiryBefore?: string }
const batchReqs: BatchParams[] = []
const isBatchCount = (params: BatchParams) => params.size === 1
const lot = (slug: string, expiryDate: string, materialSlug = 'mat-1') => ({
  slug,
  entryDate: '2026-10-01',
  expiryDate,
  quantity: 10,
  remainingQuantity: 10,
  reservedQuantity: 0,
  availableQuantity: 10,
  status: 1,
  materialSlug,
  baseUnit: null,
})
const batches =
  (byCutoff: Record<string, number | Reply>, list: object[] | Reply = []) =>
  (config: { params?: BatchParams }) => {
    const params = config.params ?? {}
    batchReqs.push(params)
    if (!isBatchCount(params)) return Array.isArray(list) ? page(list) : list
    const v = byCutoff[params.expiryBefore ?? '']
    return typeof v === 'number' || v === undefined ? page([], v ?? 0) : v
  }
const batchCountReqs = () => batchReqs.filter(isBatchCount)
const has = (testID: string, text: string | RegExp) =>
  expect(screen.getByTestId(testID)).toHaveTextContent(text, { exact: false })
const lacks = (testID: string, text: string | RegExp) =>
  expect(screen.getByTestId(testID)).not.toHaveTextContent(text, { exact: false })
/** Cột mini / vòng tồn kho là `aria-hidden` (số đã có trên thẻ). */
const TODO_ROWS = /^todo-(importDraft|exportPending|exportDraft|stockLow|stockHigh)$/
const HIDDEN = { includeHiddenElements: true }
const label = (testID: string) => screen.getByTestId(testID).props.accessibilityLabel as string

/** Chỉ giả `Date` (hẹn giờ thật, để `settle` chờ được request). */
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

async function refresh() {
  const control = screen.getByTestId('overview-scroll').props.refreshControl as {
    props: { onRefresh: () => void }
  }
  await act(async () => control.props.onRefresh())
  await settle()
}

const pickPeriod = async (name: string) => {
  await fireEvent.press(within(screen.getByTestId('period-seg')).getByRole('tab', { name }))
  await settle()
}

const fullUser = () => {
  setUser([], 'SUPER_ADMIN')
  route('get', importUrl, formsApi(importUrl, { period: importPeriods }) as never)
  route('get', exportUrl, formsApi(exportUrl, { period: exportPeriods }) as never)
  route('get', '/warehouses/wh-a/materials', () => page(INVENTORY))
}

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
  batchReqs.length = 0
  route('get', batchesUrl, batches({}) as never)
  mockFocus.active.clear()
  usePeriodStore.getState().reset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
})

afterEach(() => {
  client.clear()
  jest.useRealTimers()
})

describe('OverviewScreen — đầu trang + kỳ', () => {
  it('dòng ngày thay lời chào', async () => {
    fullUser()
    await show()
    expect(screen.getByTestId('date-line')).toHaveTextContent('THỨ NĂM, 12 THÁNG 11')
    expect(screen.queryByText(/Xin chào/)).toBeNull()
  })

  it('mặc định Tháng: một request phiếu đã xác nhận cho kỳ này + kỳ trước, không còn đếm theo ngày', async () => {
    fullUser()
    await show()
    has('period-label', 'Tháng 11 · 01–12/11')
    for (const url of [importUrl, exportUrl]) {
      const ranges = periodReqs(url).map((r) => rangeOf(r.params))
      expect([...new Set(ranges)].sort()).toEqual([PREV_MONTH, MONTH])
    }
    expect(reqs.filter((r) => r.params.size === 1 && r.params.startDate)).toEqual([])
    // Đang chờ: DRAFT nhập + PENDING xuất, không kỳ.
    expect(pendingReqs(importUrl).map((r) => r.params.status)).toEqual(['DRAFT'])
    expect(pendingReqs(exportUrl).map((r) => r.params.status)).toEqual(['PENDING'])
  })

  it('chọn Tuần → kỳ 09..12/11; › vô hiệu ở kỳ hiện tại; ‹ → tuần trước, › bật lại', async () => {
    fullUser()
    await show()
    expect(screen.getByTestId('period-forward')).toBeDisabled()
    await pickPeriod('Tuần')
    has('period-label', 'Tuần này · 09–15/11')
    const ranges = periodReqs(importUrl).map((r) => rangeOf(r.params))
    expect(ranges).toEqual(expect.arrayContaining([WEEK, PREV_WEEK]))
    expect(screen.getByTestId('period-forward')).toBeDisabled()
    await fireEvent.press(screen.getByTestId('period-back'))
    await settle()
    has('period-label', 'Tuần trước · 02–08/11')
    expect(screen.getByTestId('period-forward')).toBeEnabled()
    expect(periodReqs(importUrl).map((r) => rangeOf(r.params))).toEqual(
      expect.arrayContaining(['2026-11-02..2026-11-08', '2026-10-26..2026-11-01']),
    )
    await fireEvent.press(screen.getByTestId('period-forward'))
    await settle()
    has('period-label', 'Tuần này · 09–15/11')
    expect(screen.getByTestId('period-forward')).toBeDisabled()
  })

  it('thứ tự: ngày → bộ lọc → Cần chú ý → Tiền → Việc cần làm → Tồn kho → Hoạt động', async () => {
    fullUser()
    route('get', batchesUrl, batches({ '2026-11-12': 1, '2027-01-12': 1 }) as never)
    await show()
    const order = [
      'date-line',
      'period-seg',
      'attention-expiry',
      'money-diff',
      'money-import',
      'money-export',
      'money-pending',
      'todo-importDraft',
      'overview-stock',
      'activity-summary',
    ]
    const ids = screen
      .getAllByTestId(new RegExp(`^(${order.join('|')})$`))
      .map((el) => (el.props as { testID: string }).testID)
    expect(ids).toEqual(order)
  })
})

describe('OverviewScreen — Tiền', () => {
  it('số rút gọn chỉ khi ≥ 1 triệu, chênh lệch có dấu, a11y đọc số đầy đủ', async () => {
    fullUser()
    await show()
    has('money-import', '3,1 tr đ')
    has('money-export', '4.440 đ')
    has('money-diff', '+3,1 tr đ')
    expect(label('money-import')).toContain('3.104.400 đ')
    expect(label('money-diff')).toContain('+3.099.960 đ')
    // Thanh so sánh: hai đầu số đầy đủ.
    has('money-diff', 'Nhập 3.104.400 đ')
    has('money-diff', 'Xuất 4.440 đ')
    // So kỳ trước (tới cùng thời điểm 12/10 08:45): 2.000.000 → ▲ 55%; xuất kỳ trước 0.
    has('money-import', '▲ 55% so tháng 10')
    expect(label('money-import')).toContain('tăng 55% so với tháng 10')
    has('money-export', 'Tháng 10: 0 đ')
    expect(screen.getByTestId('mini-bars-import', HIDDEN)).toBeOnTheScreen()
    expect(screen.getByTestId('mini-bars-export', HIDDEN)).toBeOnTheScreen()
  })

  it('đang chờ xử lý: tổng nhập nháp + xuất chờ duyệt, số phiếu từng loại', async () => {
    setUser([], 'SUPER_ADMIN')
    route(
      'get',
      importUrl,
      formsApi(importUrl, {
        pending: [imp('d1', '2026-11-01T09:00:00', 2_000_000), imp('d2', '2026-11-02', 80_000)],
      }) as never,
    )
    route(
      'get',
      exportUrl,
      formsApi(exportUrl, { pending: [exp('p1', '2026-11-03', 1_000_000)] }) as never,
    )
    route('get', '/warehouses/wh-a/materials', () => page(INVENTORY))
    await show()
    has('money-pending', '3,08 tr đ')
    has('money-pending', '2 phiếu nhập · 1 phiếu xuất')
    has('money-pending', 'Hiện tại')
  })

  it('chạm Nhập kho / Xuất kho → màn chi tiết', async () => {
    fullUser()
    await show()
    await fireEvent.press(screen.getByTestId('money-import'))
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/overview/[metric]',
      params: { metric: 'import' },
    })
    await fireEvent.press(screen.getByTestId('money-export'))
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/overview/[metric]',
      params: { metric: 'export' },
    })
    await fireEvent.press(screen.getByTestId('activity-detail'))
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/overview/[metric]',
      params: { metric: 'activity' },
    })
  })

  it('Năm vượt trần phiếu nhập: nhập "–" + chú thích, xuất vẫn có số, chênh lệch "–"', async () => {
    setUser(['IMPORT_FORM_READ', 'EXPORT_FORM_READ'])
    route(
      'get',
      importUrl,
      formsApi(importUrl, {
        period: (range) =>
          range === YEAR ? page([imp('y', '2026-03-01T09:00:00', 5_000)], 1, true) : page([]),
      }) as never,
    )
    route(
      'get',
      exportUrl,
      formsApi(exportUrl, {
        period: (range) => page(range === YEAR ? [exp('x', '2026-03-01T09:00:00', 4_440)] : []),
      }) as never,
    )
    await show()
    await pickPeriod('Năm')
    // 50 trang (trần) của kỳ năm nay.
    expect(periodReqs(importUrl).filter((r) => rangeOf(r.params) === YEAR)).toHaveLength(50)
    has('money-import', '–')
    has('money-import', 'quá nhiều phiếu để tính')
    lacks('money-import', /\d/)
    expect(screen.queryByTestId('mini-bars-import', HIDDEN)).toBeNull()
    has('money-export', '4.440 đ')
    expect(screen.getByTestId('mini-bars-export', HIDDEN)).toBeOnTheScreen()
    has('money-diff', '–')
    lacks('money-diff', /\d/)
    has('activity-summary', 'quá nhiều phiếu để tính')
  })

  it('chỉ IMPORT_FORM_READ: không request xuất, không thẻ xuất / chênh lệch; Hoạt động chỉ chuỗi nhập', async () => {
    setUser(['IMPORT_FORM_READ'])
    route('get', importUrl, formsApi(importUrl, { period: importPeriods }) as never)
    await show()
    expect(calls.filter((c) => c.url !== importUrl)).toEqual([])
    expect(screen.queryByTestId('money-export')).toBeNull()
    expect(screen.queryByTestId('money-diff')).toBeNull()
    has('money-import', '3,1 tr đ')
    has('activity-summary', '4 nhập')
    lacks('activity-summary', 'xuất')
    expect(screen.getByTestId('mini-bars-activity', HIDDEN)).toBeOnTheScreen()
  })

  it('lỗi kỳ này: "!" (chênh lệch cũng "!"), phần kia vẫn có số; làm mới lỗi giữ số', async () => {
    setUser(['IMPORT_FORM_READ', 'EXPORT_FORM_READ'])
    let failImports = false
    route(
      'get',
      importUrl,
      formsApi(importUrl, {
        period: (range) => (failImports ? (failure(500) as Reply) : importPeriods(range)),
      }) as never,
    )
    route(
      'get',
      exportUrl,
      formsApi(exportUrl, {
        period: (range) => (range === MONTH ? (failure(500) as Reply) : page([])),
      }) as never,
    )
    await show()
    expect(screen.getByTestId('money-export-error')).toBeOnTheScreen()
    expect(screen.getByTestId('money-diff-error')).toBeOnTheScreen()
    has('money-import', '3,1 tr đ')
    failImports = true
    await refresh()
    has('money-import', '3,1 tr đ')
    expect(screen.queryByTestId('money-import-error')).toBeNull()
  })

  it('đang tải: khung xám thay số, ô Việc cần làm không chờ', async () => {
    setUser(['IMPORT_FORM_READ'])
    route(
      'get',
      importUrl,
      formsApi(importUrl, { counts: { DRAFT: 3 }, period: () => 'hang' }) as never,
    )
    await show()
    expect(screen.getByTestId('money-import-loading')).toBeOnTheScreen()
    lacks('money-import', 'đ')
    expect(screen.getByTestId('todo-importDraft-count')).toHaveTextContent('3')
  })

  it('đổi kỳ cùng kho: giữ số cũ (mờ) tới khi có số mới', async () => {
    setUser(['IMPORT_FORM_READ'])
    let hang = false
    route(
      'get',
      importUrl,
      formsApi(importUrl, { period: (range) => (hang ? 'hang' : importPeriods(range)) }) as never,
    )
    await show()
    has('money-import', '3,1 tr đ')
    hang = true
    await fireEvent.press(screen.getByTestId('period-back'))
    await settle()
    has('period-label', 'Tháng 10')
    has('money-import', '3,1 tr đ')
    expect(screen.queryByTestId('money-import-loading')).toBeNull()
  })

  it('đổi kỳ cùng kho khi kỳ mới đang tải: không hiện dòng so kỳ trước (số cũ vẫn mờ); có dữ liệu → so đúng kỳ mới', async () => {
    setUser(['IMPORT_FORM_READ'])
    const pending: { range: string; resolve: (reply: Reply) => void }[] = []
    let hold = false
    route(
      'get',
      importUrl,
      formsApi(importUrl, {
        period: (range) => {
          if (hold)
            return new Promise<Reply>((resolve) => pending.push({ range, resolve })) as never
          return importPeriods(range)
        },
      }) as never,
    )
    await show()
    has('money-import', '▲ 55% so tháng 10')
    hold = true
    await pickPeriod('Tuần')
    has('period-label', 'Tuần này · 09–15/11')
    has('money-import', '3,1 tr đ')
    lacks('money-import', '%')
    lacks('money-import', /so tuần|so tháng|Tuần trước:/)
    expect(label('money-import')).not.toMatch(/so với/)
    expect(pending.map((p) => p.range).sort()).toEqual([PREV_WEEK, WEEK])
    // Tuần này 480.000 đ; tuần trước (tới thứ Năm 08:45) 400.000 đ → ▲ 20%.
    await act(async () => {
      for (const { range, resolve } of pending.splice(0))
        resolve(
          page(
            range === WEEK
              ? [imp('w1', '2026-11-10T14:00:00', 480_000)]
              : [imp('w0', '2026-11-03T14:00:00', 400_000)],
          ),
        )
    })
    await settle()
    has('money-import', '480.000 đ')
    has('money-import', '▲ 20% so tuần trước')
    expect(label('money-import')).toContain('tăng 20% so với tuần trước')
  })

  it('đổi kho khi đang lùi 2 kỳ: không hiện số kho cũ (đang tải)', async () => {
    setUser(['IMPORT_FORM_READ'])
    // Mỗi kỳ: một phiếu 3.104.400 đ lập ngày đầu kỳ.
    route(
      'get',
      importUrl,
      formsApi(importUrl, {
        period: (range) => page([imp('s', `${range.slice(0, 10)}T09:00:00`, 3_104_400)]),
      }) as never,
    )
    await show()
    await fireEvent.press(screen.getByTestId('period-back'))
    await settle()
    await fireEvent.press(screen.getByTestId('period-back'))
    await settle()
    has('period-label', 'Tháng 9')
    has('money-import', '3,1 tr đ')
    route('get', '/warehouses/wh-b/import-forms', forever)
    await act(async () => {
      useWarehouseStore.setState({
        current: { slug: 'wh-b', code: 'B', name: 'Kho B', isManager: true },
      })
    })
    await settle()
    expect(screen.getByTestId('money-import-loading')).toBeOnTheScreen()
    lacks('money-import', 'tr đ')
    lacks('activity-summary', /\d/)
  })

  it('không quyền phiếu nào → không nhóm Tiền / Hoạt động, không gọi phiếu', async () => {
    setUser(['MATERIAL_READ', 'WAREHOUSE_READ'])
    route('get', '/warehouses/wh-a/materials', () => page(INVENTORY))
    await show()
    expect(screen.queryByTestId('money-import')).toBeNull()
    expect(screen.queryByTestId('money-pending')).toBeNull()
    expect(screen.queryByTestId('activity-summary')).toBeNull()
    expect(screen.queryByText('Tiền')).toBeNull()
    expect(screen.getByTestId('overview-stock')).toBeOnTheScreen()
    expect(reqs).toEqual([])
  })
})

describe('OverviewScreen — Hoạt động', () => {
  it('số phiếu kỳ này + nhập / xuất, biểu đồ cột đôi', async () => {
    fullUser()
    await show()
    has('activity-summary', '5 phiếu')
    has('activity-summary', '4 nhập · 1 xuất')
    expect(screen.getByTestId('activity-detail').props.accessibilityHint).toBe(
      'Mở biểu đồ chi tiết',
    )
    expect(screen.getByTestId('mini-bars-activity', HIDDEN)).toBeOnTheScreen()
  })
})

describe('OverviewScreen — Cần chú ý (Hạn dùng)', () => {
  const stockUser = () => {
    setUser(['MATERIAL_READ', 'WAREHOUSE_READ'])
    route('get', '/warehouses/wh-a/materials', () => page(INVENTORY))
  }

  it('1 quá hạn / 3 sắp hết hạn: số + 2 lô sớm nhất; chạm → sheet focus expired', async () => {
    stockUser()
    route(
      'get',
      batchesUrl,
      batches({ '2026-11-12': 1, '2027-01-12': 4 }, [
        lot('b-1', '2026-11-09'),
        lot('b-2', '2026-11-19', 'cam'),
        lot('b-3', '2026-11-25'),
      ]) as never,
    )
    await show()
    expect(screen.getByText('Cần chú ý')).toBeOnTheScreen()
    has('attention-expiry', '1 lô quá hạn')
    has('attention-expiry', 'và 3 lô sắp hết hạn')
    has('attention-expiry-expired', '1 lô đã quá hạn')
    has('attention-expiry-soon', '3 lô sắp hết hạn')
    const rows = screen
      .getAllByTestId(/^attention-lot-/)
      .map((el) => (el.props as { testID: string }).testID)
    expect(rows).toEqual(['attention-lot-b-1', 'attention-lot-b-2'])
    has('attention-lot-b-1', 'Xi măng Hà Tiên PCB40')
    has('attention-lot-b-1', 'Quá 3 ngày')
    has('attention-lot-b-2', 'cam')
    has('attention-lot-b-2', 'Còn 7 ngày')
    expect(label('attention-expiry-main')).toBe('Hạn dùng: 1 quá hạn, 3 sắp hết hạn')
    // Hàng lô mở sheet đúng nhóm theo trạng thái của lô.
    await fireEvent.press(screen.getByTestId('attention-lot-b-1'))
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/expiry-batches',
      params: { focus: 'expired' },
    })
    await fireEvent.press(screen.getByTestId('attention-lot-b-2'))
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/expiry-batches',
      params: { focus: 'soon' },
    })
    await fireEvent.press(screen.getByTestId('attention-expiry-soon'))
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/expiry-batches',
      params: { focus: 'soon' },
    })
    await fireEvent.press(screen.getByTestId('attention-expiry-expired'))
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/expiry-batches',
      params: { focus: 'expired' },
    })
    await fireEvent.press(screen.getByText('Xem tất cả'))
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/expiry-batches',
      params: { focus: 'expired' },
    })
  })

  it('chỉ sắp hết hạn: số lớn là số sắp hết hạn, chạm → focus soon', async () => {
    stockUser()
    route('get', batchesUrl, batches({ '2026-11-12': 0, '2027-01-12': 3 }) as never)
    await show()
    has('attention-expiry-main', '3 lô sắp hết hạn')
    lacks('attention-expiry-main', 'quá hạn')
    lacks('attention-expiry', 'quá hạn')
    expect(screen.queryByTestId('attention-expiry-expired')).toBeNull()
    has('attention-expiry-soon', '3 lô sắp hết hạn')
    await fireEvent.press(screen.getByText('Xem tất cả'))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/expiry-batches',
      params: { focus: 'soon' },
    })
  })

  it('cả hai 0 → không có nhóm "Cần chú ý", không tải danh sách lô', async () => {
    stockUser()
    await show()
    expect(screen.queryByText('Cần chú ý')).toBeNull()
    expect(screen.queryByTestId('attention-expiry')).toBeNull()
    expect(
      batchCountReqs()
        .map((p) => p.expiryBefore)
        .sort(),
    ).toEqual(['2026-11-12', '2027-01-12'])
    expect(batchReqs.filter((p) => !isBatchCount(p))).toEqual([])
  })

  it('quá hạn > 0 nhưng đếm sắp hết hạn lỗi: vẫn hiện, phần sắp hết hạn "!"', async () => {
    stockUser()
    route('get', batchesUrl, batches({ '2026-11-12': 2, '2027-01-12': failure(500) }) as never)
    await show()
    has('attention-expiry', '2 lô quá hạn')
    expect(screen.getByTestId('attention-soon-error')).toBeOnTheScreen()
    expect(label('attention-expiry-main')).toBe(
      'Hạn dùng: 2 quá hạn, số sắp hết hạn không tải được',
    )
  })

  it('đếm quá hạn lỗi (500): nhóm vẫn hiện, số lớn "!"', async () => {
    stockUser()
    route('get', batchesUrl, batches({ '2026-11-12': failure(500), '2027-01-12': 0 }) as never)
    await show()
    expect(screen.getByText('Cần chú ý')).toBeOnTheScreen()
    expect(screen.getByTestId('attention-expired-error')).toHaveTextContent('!')
    expect(label('attention-expiry-main')).toBe('Hạn dùng: số lô quá hạn không tải được')
    expect(batchReqs.filter((p) => !isBatchCount(p))).toEqual([])
  })

  it('quá hạn 0 nhưng đếm sắp hết hạn lỗi: nhóm vẫn hiện với "!"', async () => {
    stockUser()
    route('get', batchesUrl, batches({ '2026-11-12': 0, '2027-01-12': failure(500) }) as never)
    await show()
    expect(screen.getByTestId('attention-soon-error')).toHaveTextContent('!')
  })

  it('không quyền tồn kho → không nhóm, không gọi lô', async () => {
    setUser(['IMPORT_FORM_READ'])
    route('get', importUrl, formsApi(importUrl) as never)
    route('get', batchesUrl, batches({ '2026-11-12': 2 }) as never)
    await show()
    expect(screen.queryByTestId('attention-expiry')).toBeNull()
    expect(batchReqs).toEqual([])
  })
})

describe('OverviewScreen — Việc cần làm + Tồn kho', () => {
  it('số từng ô theo thứ tự, ô 0 vẫn hiện', async () => {
    setUser([], 'SUPER_ADMIN')
    route('get', importUrl, formsApi(importUrl, { counts: { DRAFT: 3 } }) as never)
    route('get', exportUrl, formsApi(exportUrl, { counts: { DRAFT: 0, PENDING: 2 } }) as never)
    route('get', '/warehouses/wh-a/materials', () => page(INVENTORY))
    await show()
    const num = (key: string) => screen.getByTestId(`todo-${key}-count`)
    expect(num('importDraft')).toHaveTextContent('3')
    expect(num('exportDraft')).toHaveTextContent('0')
    expect(num('exportPending')).toHaveTextContent('2')
    expect(num('stockLow')).toHaveTextContent('2')
    expect(num('stockHigh')).toHaveTextContent('1')
    const ids = screen
      .getAllByTestId(TODO_ROWS)
      .map((el) => (el.props as { testID: string }).testID)
    expect(ids).toEqual([
      'todo-importDraft',
      'todo-exportPending',
      'todo-exportDraft',
      'todo-stockLow',
      'todo-stockHigh',
    ])
  })

  describe('card Việc cần làm', () => {
    const OK_ONLY = [
      item({ slug: 'c', quantity: 90, availableQuantity: 90, isAboveMaximum: true }),
      item({ slug: 'd', quantity: 40, availableQuantity: 40 }),
    ]
    it('một card, dòng chính = tổng các mục (14 + 1 + 3 + 0 + 1)', async () => {
      setUser([], 'SUPER_ADMIN')
      route('get', importUrl, formsApi(importUrl, { counts: { DRAFT: 14 } }) as never)
      route('get', exportUrl, formsApi(exportUrl, { counts: { PENDING: 1, DRAFT: 3 } }) as never)
      route('get', '/warehouses/wh-a/materials', () => page(OK_ONLY))
      await show()
      has('todo-total', '19 việc đang chờ')
      has('todo-card', 'Việc cần làm')
      has('todo-importDraft', '14')
      has('todo-importDraft', 'phiếu chờ kiểm hàng')
      // Hàng 0 vẫn có.
      expect(screen.getByTestId('todo-stockLow-count')).toHaveTextContent('0')
      // Hàng 0 mờ (muted), hàng có số thì không.
      expect(screen.getByTestId('todo-stockLow-count')).toHaveStyle({
        color: lightColors.mutedForeground,
      })
      expect(screen.getByTestId('todo-importDraft-count')).toHaveStyle({
        color: lightColors.foreground,
      })
      expect(screen.getByTestId('todo-stockLow')).toBeOnTheScreen()
    })

    it('một mục đang tải → dòng chính "–" (không hiện tổng thiếu)', async () => {
      setUser([], 'SUPER_ADMIN')
      route('get', importUrl, formsApi(importUrl, { counts: { DRAFT: 14 } }) as never)
      route(
        'get',
        exportUrl,
        formsApi(exportUrl, { counts: { PENDING: forever() as never } }) as never,
      )
      route('get', '/warehouses/wh-a/materials', () => page(OK_ONLY))
      await show()
      has('todo-total', '–')
      lacks('todo-total', 'việc đang chờ')
    })

    it('một mục lỗi → dòng chính "–"', async () => {
      setUser([], 'SUPER_ADMIN')
      route('get', importUrl, formsApi(importUrl, { counts: { DRAFT: 14 } }) as never)
      route(
        'get',
        exportUrl,
        formsApi(exportUrl, { counts: { PENDING: failure(500) as Reply } }) as never,
      )
      route('get', '/warehouses/wh-a/materials', () => page(OK_ONLY))
      await show()
      has('todo-total', '–')
      lacks('todo-total', 'việc đang chờ')
    })

    it('tất cả 0 → "Không có việc tồn"', async () => {
      setUser([], 'SUPER_ADMIN')
      route('get', importUrl, formsApi(importUrl) as never)
      route('get', exportUrl, formsApi(exportUrl) as never)
      route('get', '/warehouses/wh-a/materials', () => page(OK_ONLY.slice(1)))
      await show()
      has('todo-total', 'Không có việc tồn')
      expect(screen.getAllByTestId(TODO_ROWS)).toHaveLength(5)
    })

    it('chỉ IMPORT_FORM_READ → chỉ hàng phiếu nhập; không quyền nào → không card', async () => {
      setUser(['IMPORT_FORM_READ'])
      route('get', importUrl, formsApi(importUrl, { counts: { DRAFT: 2 } }) as never)
      await show()
      has('todo-total', '2 việc đang chờ')
      expect(
        screen.getAllByTestId(TODO_ROWS).map((el) => (el.props as { testID: string }).testID),
      ).toEqual(['todo-importDraft'])
    })

    it('tiêu đề "Việc cần làm" là heading cho trình đọc màn hình', async () => {
      setUser([], 'SUPER_ADMIN')
      await show()
      expect(screen.getByRole('header', { name: 'Việc cần làm' })).toBeOnTheScreen()
    })

    it('không quyền nào → không card', async () => {
      setUser([])
      await show()
      expect(screen.queryByTestId('todo-card')).toBeNull()
    })
  })

  it('chạm ô chờ duyệt → navigate preset PENDING', async () => {
    fullUser()
    route(
      'get',
      exportUrl,
      formsApi(exportUrl, { counts: { PENDING: 2 }, period: exportPeriods }) as never,
    )
    await show()
    expect(screen.getByRole('button', { name: 'Phiếu xuất chờ duyệt, 2' })).toBeOnTheScreen()
    await fireEvent.press(screen.getByTestId('todo-exportPending'))
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/export',
      params: { preset: 'PENDING' },
    })
  })

  it('một số đếm lỗi: ô đó "!" vẫn chạm được; ô khác vẫn có số', async () => {
    setUser(['IMPORT_FORM_READ', 'EXPORT_FORM_READ'])
    route('get', importUrl, formsApi(importUrl, { counts: { DRAFT: 3 } }) as never)
    route(
      'get',
      exportUrl,
      formsApi(exportUrl, { counts: { PENDING: failure(500) as Reply } }) as never,
    )
    await show()
    expect(screen.getByTestId('todo-importDraft-count')).toHaveTextContent('3')
    expect(screen.getByTestId('todo-exportPending-error')).toBeOnTheScreen()
    await fireEvent.press(screen.getByTestId('todo-exportPending'))
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/export',
      params: { preset: 'PENDING' },
    })
  })

  it('thẻ Tồn kho: % ổn định + phân loại, a11y đủ; chạm → /stock preset all', async () => {
    fullUser()
    await show()
    has('stock-card', '25% ổn định')
    has('stock-card', '1 hết · 1 dưới mức · 1 vượt mức')
    has('stock-card', '4 vật tư')
    expect(screen.getByTestId('stock-donut', HIDDEN)).toBeOnTheScreen()
    expect(label('stock-card-main')).toBe(
      'Tình trạng tồn kho: 4 vật tư, 1 hết, 1 dưới mức, 1 vượt mức',
    )
    expect(screen.getByTestId('overview-stock')).toHaveTextContent('Xem tồn kho')
    await fireEvent.press(screen.getByTestId('overview-stock'))
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/stock', params: { preset: 'all' } })
  })
})

describe('OverviewScreen — làm mới', () => {
  it('kéo làm mới: tải lại số đếm, phiếu theo kỳ (kỳ này + kỳ trước), đang chờ, số lô', async () => {
    fullUser()
    await show()
    const before = {
      counts: countReqsOf().length,
      period: periodReqs(importUrl).length + periodReqs(exportUrl).length,
      pending: pendingReqs(importUrl).length + pendingReqs(exportUrl).length,
      lots: batchCountReqs().length,
    }
    expect(before).toEqual({ counts: 3, period: 4, pending: 2, lots: 2 })
    await refresh()
    expect(countReqsOf()).toHaveLength(6)
    expect(periodReqs(importUrl).length + periodReqs(exportUrl).length).toBe(8)
    expect(pendingReqs(importUrl).length + pendingReqs(exportUrl).length).toBe(4)
    expect(batchCountReqs()).toHaveLength(4)
  })

  it('quay lại tab: số đã cũ được tải lại (gồm phiếu theo kỳ), còn tươi thì không', async () => {
    setUser(['IMPORT_FORM_READ'])
    route('get', importUrl, formsApi(importUrl, { period: importPeriods }) as never)
    await show()
    expect(countReqsOf()).toHaveLength(1)
    expect(periodReqs(importUrl)).toHaveLength(2)
    await refocus()
    await settle()
    expect(countReqsOf()).toHaveLength(1)
    expect(periodReqs(importUrl)).toHaveLength(2)
    await act(async () => {
      await client.invalidateQueries({ refetchType: 'none' })
    })
    await refocus()
    await settle()
    expect(countReqsOf()).toHaveLength(2)
    expect(periodReqs(importUrl)).toHaveLength(4)
    expect(pendingReqs(importUrl)).toHaveLength(2)
  })

  it('sang ngày mới khi tab còn mở: quay lại tab → kỳ tính lại', async () => {
    setUser(['IMPORT_FORM_READ'])
    route('get', importUrl, formsApi(importUrl) as never)
    await show()
    jest.setSystemTime(new Date(2026, 10, 13, 0, 5))
    await refocus()
    await settle()
    expect(periodReqs(importUrl).map((r) => rangeOf(r.params))).toEqual(
      expect.arrayContaining(['2026-11-01..2026-11-13', '2026-10-01..2026-10-13']),
    )
    has('date-line', 'THỨ SÁU, 13 THÁNG 11')
  })

  describe('app về foreground', () => {
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

    it('cùng ngày, query đã cũ: tải lại phiếu theo kỳ + số đếm; còn tươi thì không', async () => {
      setUser(['IMPORT_FORM_READ'])
      route('get', importUrl, formsApi(importUrl, { period: importPeriods }) as never)
      await show()
      expect(periodReqs(importUrl)).toHaveLength(2)
      await act(async () => onChange?.('active'))
      await settle()
      expect(periodReqs(importUrl)).toHaveLength(2)
      await act(async () => {
        await client.invalidateQueries({ refetchType: 'none' })
      })
      await act(async () => onChange?.('active'))
      await settle()
      expect(periodReqs(importUrl)).toHaveLength(4)
      expect(countReqsOf()).toHaveLength(2)
    })

    it('so sánh cắt ở lúc có số (09:00), không phải giờ vẽ lại (15:00)', async () => {
      jest.setSystemTime(new Date(2026, 10, 12, 9, 0))
      setUser(['IMPORT_FORM_READ'])
      let hang = false
      const inner = formsApi(importUrl, {
        period: (range) =>
          page(
            range === MONTH
              ? [imp('c1', '2026-11-05T10:00:00', 2_000)]
              : range === PREV_MONTH
                ? [imp('p1', '2026-10-12T08:00:00', 1_000), imp('p2', '2026-10-12T12:00:00', 5_000)]
                : [],
          ),
      })
      route('get', importUrl, ((config: { params?: Params }) =>
        hang ? forever() : inner(config)) as never)
      await show()
      has('money-import', '▲ 100% so tháng 10')
      hang = true
      jest.setSystemTime(new Date(2026, 10, 12, 15, 0))
      await act(async () => onChange?.('active'))
      // Làm mới đang treo: số vẫn là của lúc 09:00 → kỳ trước cũng chỉ tới 09:00 (loại phiếu 12:00).
      has('money-import', '▲ 100% so tháng 10')
    })
  })

  it('app về foreground sau nửa đêm: tính lại kỳ', async () => {
    let onChange: ((state: string) => void) | undefined
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      handler: (state: string) => void,
    ) => {
      onChange = handler
      return { remove: jest.fn() }
    }) as never)
    setUser(['IMPORT_FORM_READ'])
    route('get', importUrl, formsApi(importUrl) as never)
    await show()
    jest.setSystemTime(new Date(2026, 10, 13, 0, 5))
    await act(async () => onChange?.('active'))
    await settle()
    expect(periodReqs(importUrl).map((r) => rangeOf(r.params))).toContain('2026-11-01..2026-11-13')
    // AppState.addEventListener đã là jest.fn của preset RN: trả lại bản vô hại thay vì restore.
    spy.mockImplementation((() => ({ remove: jest.fn() })) as never)
  })
})
