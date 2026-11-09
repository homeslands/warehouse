// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StyleSheet } from 'react-native'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react-native'

import type { InventoryHistory, InventoryItem, MaterialBatch } from '@/entities/inventory'
import { item, unit } from '@/entities/inventory/model/fixtures'
import { useWarehouseStore } from '@/entities/warehouse'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { formatEntryDate } from '@/shared/lib/format'
import { lightColors } from '@/shared/theme/tokens'

import { DetailTabs } from './DetailTabs'
import { StockDetailScreen } from './StockDetailScreen'

const fontOf = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as never)?.fontFamily
const mockDispatch = jest.fn()
const mockParams = { materialSlug: 'xi-mang-pcb40' }
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useNavigation: () => ({
    dispatch: mockDispatch,
    // Màn đang ở đỉnh Stack của tab (xem `useLeaveOnWarehouseChange`).
    getState: () => ({ index: 1, routes: [{ key: 'list' }, { key: 'me' }] }),
  }),
  useRoute: () => ({ key: 'me' }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}))

const WH_A = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const WH_B = { slug: 'wh-b', code: 'B', name: 'Kho Thủ Đức', isManager: false }

/** Xi măng của mockup (phone 2): 168 bao, giữ 30, min 200 / max 800, 1 tấn = 20 bao. */
const XM: InventoryItem = item({
  slug: 'i-xm',
  materialSlug: 'xi-mang-pcb40',
  materialCode: 'VT-XM-040',
  materialName: 'Xi măng Hà Tiên PCB40',
  quantity: 168,
  reservedQuantity: 30,
  availableQuantity: 138,
  effectiveMinimumInventory: 200,
  effectiveMaximumInventory: 800,
  isBelowMinimum: true,
  typeName: 'Vật liệu xây',
  baseUnit: { slug: 'u-bao', code: 'BAO', name: 'bao' },
  units: [
    unit({ unitSlug: 'u-bao', unitName: 'bao', conversionRate: 1, isBaseUnit: true }),
    unit({ unitSlug: 'u-tan', unitName: 'tấn', conversionRate: 20, isBaseUnit: false }),
  ],
})

/** `yyyy-MM-dd` của hôm nay + n ngày (giờ máy). */
function plusDays(n: number) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function batch(over: Partial<MaterialBatch>): MaterialBatch {
  return {
    slug: 'b',
    entryDate: '2026-09-20',
    expiryDate: null,
    quantity: 10,
    remainingQuantity: 10,
    reservedQuantity: 0,
    availableQuantity: 10,
    status: 1,
    materialSlug: 'xi-mang-pcb40',
    baseUnit: null,
    ...over,
  }
}

/** 3 lô của mockup; server trả lô KHÔNG hạn dùng lên đầu (NULL đứng trước khi ASC). */
const BATCHES: MaterialBatch[] = [
  batch({
    slug: 'b-3',
    entryDate: '2026-11-03',
    expiryDate: null,
    quantity: 50,
    remainingQuantity: 50,
    availableQuantity: 50,
  }),
  batch({
    slug: 'b-1',
    entryDate: '2026-09-20',
    expiryDate: plusDays(47),
    quantity: 60,
    remainingQuantity: 48,
    availableQuantity: 48,
  }),
  batch({
    slug: 'b-2',
    entryDate: '2026-10-15',
    expiryDate: plusDays(72),
    quantity: 100,
    remainingQuantity: 70,
    reservedQuantity: 30,
    availableQuantity: 40,
  }),
]

const page = (items: object[]) =>
  ok({
    items,
    total: items.length,
    page: 1,
    pageSize: 100,
    totalPages: 1,
    hasNext: false,
    hasPrevios: false,
  })

const LIST_A = '/warehouses/wh-a/materials'
const BATCHES_A = '/warehouses/wh-a/material-batches'
const HISTORY_A = '/warehouses/wh-a/materials/xi-mang-pcb40/histories'

/** Một dòng lịch sử nhập kho hôm nay (giờ máy). */
function historyRow(slug: string): InventoryHistory {
  const now = new Date()
  const createdAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 30).toISOString()
  return {
    slug,
    createdAt,
    updatedAt: createdAt,
    action: 'IMPORT',
    quantityDelta: 1,
    quantityBefore: 0,
    quantityAfter: 1,
    reservedDelta: 0,
    reservedBefore: 0,
    reservedAfter: 0,
    note: slug,
    changedBySlug: null,
    changedByName: '',
  }
}

/** Lịch sử 2 trang: trang 1 có `hasNext`, trang 2 là trang cuối. */
function historyPages() {
  route('get', HISTORY_A, (config) => {
    const n = Number(config.params?.page ?? 1)
    return ok({
      items: [historyRow(`trang-${n}`)],
      total: 2,
      page: n,
      pageSize: 30,
      totalPages: 2,
      hasNext: n < 2,
      hasPrevios: n > 1,
    })
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
      <StockDetailScreen />
    </QueryClientProvider>,
  )
  await settled()
}

function stock(items: InventoryItem[] = [XM], batches: MaterialBatch[] = BATCHES) {
  route('get', LIST_A, () => page(items))
  route('get', BATCHES_A, () => page(batches))
}

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  jest.clearAllMocks()
  resetFakeApi()
  mockParams.materialSlug = 'xi-mang-pcb40'
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH_A, resolved: true, resolution: 'selected' })
})

afterEach(async () => {
  // Gỡ màn TRƯỚC khi xoá cache: `client.clear()` khi màn còn gắn sẽ báo cập nhật ngoài act().
  await cleanup()
  client.clear()
})

describe('StockDetailScreen — số tồn', () => {
  it('xi măng: mã · loại, tên, 168 bao + mức tồn, ≈ 8,4 tấn, Đang giữ 30 / Còn lấy được 138, thanh min/max', async () => {
    stock()
    await show()
    expect(screen.getByText('VT-XM-040 · Vật liệu xây')).toBeOnTheScreen()
    expect(fontOf(screen.getByText('VT-XM-040'))).toBe('ui-monospace')
    expect(fontOf(screen.getByText('VT-XM-040 · Vật liệu xây'))).toBeUndefined()
    expect(screen.getByRole('header', { name: 'Xi măng Hà Tiên PCB40' })).toBeOnTheScreen()

    const hero = within(screen.getByTestId('stock-hero'))
    expect(hero.getByText('168')).toBeOnTheScreen()
    expect(hero.getByText('bao')).toBeOnTheScreen()
    expect(hero.getByText('Dưới tối thiểu')).toBeOnTheScreen()
    expect(hero.getByText('≈ 8,4 tấn · 1 tấn = 20 bao')).toBeOnTheScreen()
    expect(within(screen.getByTestId('stock-reserved')).getByText('Đang giữ')).toBeOnTheScreen()
    expect(within(screen.getByTestId('stock-reserved')).getByText('30')).toBeOnTheScreen()
    expect(
      within(screen.getByTestId('stock-available')).getByText('Còn lấy được'),
    ).toBeOnTheScreen()
    expect(within(screen.getByTestId('stock-available')).getByText('138')).toBeOnTheScreen()

    const gauge = within(screen.getByTestId('level-gauge'))
    expect(gauge.getByText('200 bao')).toBeOnTheScreen()
    expect(gauge.getByText('800 bao')).toBeOnTheScreen()
  })

  it('vạch trên thanh min/max kẹp trong 0–100% (tồn vượt xa max)', async () => {
    stock([{ ...XM, quantity: 5000, isBelowMinimum: false, isAboveMaximum: true }])
    await show()
    expect(screen.getByTestId('level-gauge-mark', { includeHiddenElements: true })).toHaveStyle({
      left: '100%',
    })
  })

  it('không có đơn vị quy đổi → không có dòng "≈"; min = max = 0 → không có thanh min/max', async () => {
    stock([
      {
        ...XM,
        units: [],
        effectiveMinimumInventory: 0,
        effectiveMaximumInventory: 0,
        isBelowMinimum: false,
      },
    ])
    await show()
    expect(screen.getByText('168')).toBeOnTheScreen()
    expect(screen.queryByText(/^≈/)).toBeNull()
    expect(screen.queryByTestId('level-gauge')).toBeNull()
    // Mức "ổn" không có nhãn mức tồn.
    expect(screen.queryByText('Dưới tối thiểu')).toBeNull()
  })

  it('vật tư chưa có đơn vị gốc → chỉ hiện số, quy đổi không kèm "= … bao"', async () => {
    stock([{ ...XM, baseUnit: null }])
    await show()
    expect(screen.getByText('168')).toBeOnTheScreen()
    expect(screen.getByText('≈ 8,4 tấn')).toBeOnTheScreen()
  })

  it('vật tư không còn ở kho → câu báo, không vỡ màn', async () => {
    stock([item({ materialSlug: 'khac', materialName: 'Vật tư khác' })], [])
    await show()
    expect(screen.getByText('Vật tư không còn ở kho này')).toBeOnTheScreen()
    expect(screen.queryByTestId('stock-hero')).toBeNull()
  })

  it('lỗi lần đầu → màn lỗi, Thử lại gọi lại API', async () => {
    route('get', LIST_A, () => ({ status: 500 }))
    route('get', BATCHES_A, () => page(BATCHES))
    await show()
    expect(screen.getByText('Không tải được tồn kho')).toBeOnTheScreen()
    stock()
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    await settled()
    expect(screen.getByTestId('stock-hero')).toBeOnTheScreen()
    expect(callsTo('get', LIST_A)).toHaveLength(2)
  })
})

describe('StockDetailScreen — tab Theo lô', () => {
  it('3 lô theo thứ tự mockup: hạn gần trước, không hạn dùng cuối; số còn lấy được + giữ / trên x nhập', async () => {
    stock()
    await show()
    expect(screen.getByRole('tab', { name: 'Theo lô · 3' })).toBeOnTheScreen()

    const rows = screen.getAllByTestId('batch-row')
    expect(rows).toHaveLength(3)
    const [first, second, third] = rows.map((r) => within(r))
    expect(first.getByText(`Nhập ${formatEntryDate('2026-09-20', new Date())}`)).toBeOnTheScreen()
    expect(first.getByText('48')).toBeOnTheScreen()
    expect(first.getByText('trên 60 nhập')).toBeOnTheScreen()
    expect(second.getByText(`Nhập ${formatEntryDate('2026-10-15', new Date())}`)).toBeOnTheScreen()
    expect(second.getByText('40')).toBeOnTheScreen()
    expect(second.getByText('giữ 30')).toBeOnTheScreen()
    expect(third.getByText(`Nhập ${formatEntryDate('2026-11-03', new Date())}`)).toBeOnTheScreen()
    expect(third.getByText('Không HSD')).toBeOnTheScreen()
  })

  it('lô còn 47 ngày: "còn 47 ngày" màu đỏ; lô còn 72 ngày: chỉ HSD, không đỏ', async () => {
    stock()
    await show()
    const [first, second] = screen.getAllByTestId('batch-row').map((r) => within(r))
    expect(first.getByText(/còn 47 ngày/)).toHaveStyle({ color: lightColors.destructiveText })
    const plain = second.getByText(/^HSD /)
    expect(plain).not.toHaveTextContent(/còn/)
    expect(plain).not.toHaveStyle({ color: lightColors.destructiveText })
  })

  it('lô đã hết hạn → "đã hết hạn" màu đỏ', async () => {
    stock([XM], [batch({ slug: 'old', expiryDate: plusDays(-3) })])
    await show()
    expect(within(screen.getByTestId('batch-row')).getByText(/đã hết hạn/)).toHaveStyle({
      color: lightColors.destructiveText,
    })
  })

  it('không có lô → "Chưa có lô còn hàng"', async () => {
    stock([XM], [])
    await show()
    expect(screen.getByText('Chưa có lô còn hàng')).toBeOnTheScreen()
    expect(screen.getByRole('tab', { name: 'Theo lô · 0' })).toBeOnTheScreen()
  })

  it('lỗi tải lô → báo lỗi trong tab + Thử lại chỉ gọi lại lô', async () => {
    route('get', LIST_A, () => page([XM]))
    route('get', BATCHES_A, () => ({ status: 500 }))
    await show()
    expect(screen.getByTestId('stock-hero')).toBeOnTheScreen()
    expect(screen.getByText('Không tải được danh sách lô')).toBeOnTheScreen()
    route('get', BATCHES_A, () => page(BATCHES))
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    await settled()
    expect(screen.getAllByTestId('batch-row')).toHaveLength(3)
    expect(callsTo('get', LIST_A)).toHaveLength(1)
  })

  it('kéo xuống làm mới → gọi lại cả số tồn và lô', async () => {
    stock()
    await show()
    const refresh = screen.getByTestId('stock-detail-scroll').props.refreshControl
    await act(async () => refresh.props.onRefresh())
    await settled()
    expect(callsTo('get', LIST_A)).toHaveLength(2)
    expect(callsTo('get', BATCHES_A)).toHaveLength(2)
  })
})

describe('StockDetailScreen — làm mới lỗi (Review Focus 5)', () => {
  const pull = async () => {
    const refresh = screen.getByTestId('stock-detail-scroll').props.refreshControl
    await act(async () => refresh.props.onRefresh())
    await settled()
  }

  it('làm mới số tồn lỗi → giữ số cũ + dòng báo lỗi; Thử lại thành công → hết báo lỗi', async () => {
    stock()
    await show()
    expect(screen.queryByText('Không làm mới được số tồn')).toBeNull()
    route('get', LIST_A, () => ({ status: 500 }))
    await pull()
    expect(screen.getByText('Không làm mới được số tồn')).toBeOnTheScreen()
    expect(within(screen.getByTestId('stock-hero')).getByText('168')).toBeOnTheScreen()

    route('get', LIST_A, () => page([XM]))
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    await settled()
    expect(screen.queryByText('Không làm mới được số tồn')).toBeNull()
  })

  it('làm mới lô lỗi → giữ danh sách lô + dòng báo lỗi', async () => {
    stock()
    await show()
    route('get', BATCHES_A, () => ({ status: 500 }))
    await pull()
    expect(screen.getByText('Không làm mới được số tồn')).toBeOnTheScreen()
    expect(screen.getAllByTestId('batch-row')).toHaveLength(3)
  })
})

describe('StockDetailScreen — đổi kho, segmented', () => {
  it('đổi kho → về danh sách; không lúc nào hiện vật tư của kho cũ dưới kho mới', async () => {
    stock()
    route('get', '/warehouses/wh-b/materials', () => new Promise(() => {}))
    route('get', '/warehouses/wh-b/material-batches', () => new Promise(() => {}))
    await show()
    expect(screen.getByText('Xi măng Hà Tiên PCB40')).toBeOnTheScreen()
    await act(async () => useWarehouseStore.setState({ current: WH_B }))
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'POP_TO_TOP' })
    expect(mockDispatch).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Xi măng Hà Tiên PCB40')).toBeNull()
    expect(screen.queryAllByTestId('batch-row')).toHaveLength(0)
  })

  it('lần hiện đầu không điều hướng', async () => {
    stock()
    await show()
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('chạm "Lịch sử" → sang tab lịch sử (ẩn danh sách lô)', async () => {
    stock()
    historyPages()
    await show()
    await fireEvent.press(screen.getByRole('tab', { name: 'Lịch sử' }))
    // Mở tab thì tải trang lịch sử đầu: chờ xong để cập nhật không rơi ra ngoài act().
    await settled()
    expect(screen.getByRole('tab', { name: 'Lịch sử' })).toBeSelected()
    expect(screen.queryAllByTestId('batch-row')).toHaveLength(0)
  })
})

describe('StockDetailScreen — tab Lịch sử', () => {
  const openHistory = async () => {
    await fireEvent.press(screen.getByRole('tab', { name: 'Lịch sử' }))
    await settled()
  }
  /** Cuộn `ScrollView` của màn tới gần cuối (nội dung 1.200, khung 300). */
  const scrollToEnd = async () => {
    await fireEvent.scroll(screen.getByTestId('stock-detail-scroll'), {
      nativeEvent: {
        contentOffset: { x: 0, y: 880 },
        contentSize: { width: 390, height: 1200 },
        layoutMeasurement: { width: 390, height: 300 },
      },
    })
    await settled()
  }

  it('chưa mở tab Lịch sử → không gọi API lịch sử', async () => {
    stock()
    historyPages()
    await show()
    expect(callsTo('get', HISTORY_A)).toHaveLength(0)
  })

  it('mở tab: thẻ số tồn thu gọn một dòng "168 bao · còn lấy được 138", hiện trang 1', async () => {
    stock()
    historyPages()
    await show()
    await openHistory()
    const hero = within(screen.getByTestId('stock-hero'))
    expect(hero.getByText('168')).toBeOnTheScreen()
    expect(hero.getByText('bao')).toBeOnTheScreen()
    expect(hero.getByText('còn lấy được')).toBeOnTheScreen()
    expect(hero.getByText('138')).toBeOnTheScreen()
    expect(screen.queryByTestId('stock-reserved')).toBeNull()
    expect(screen.queryByTestId('level-gauge')).toBeNull()
    expect(screen.getAllByTestId('history-row')).toHaveLength(1)
    expect(screen.getByText(/^trang-1/)).toBeOnTheScreen()
  })

  it('cuộn tới cuối → gọi trang 2 đúng một lần (kể cả 2 sự kiện cuộn liền); trang cuối không gọi thêm', async () => {
    stock()
    historyPages()
    await show()
    await openHistory()
    expect(callsTo('get', HISTORY_A)).toHaveLength(1)

    const scroll = screen.getByTestId('stock-detail-scroll')
    const nearEnd = {
      nativeEvent: {
        contentOffset: { x: 0, y: 880 },
        contentSize: { width: 390, height: 1200 },
        layoutMeasurement: { width: 390, height: 300 },
      },
    }
    await fireEvent.scroll(scroll, nearEnd)
    await fireEvent.scroll(scroll, nearEnd)
    await settled()
    expect(callsTo('get', HISTORY_A)).toHaveLength(2)
    expect(screen.getAllByTestId('history-row')).toHaveLength(2)

    await scrollToEnd()
    expect(callsTo('get', HISTORY_A)).toHaveLength(2)
  })

  it('cuộn chưa tới cuối → không tải thêm', async () => {
    stock()
    historyPages()
    await show()
    await openHistory()
    await fireEvent.scroll(screen.getByTestId('stock-detail-scroll'), {
      nativeEvent: {
        contentOffset: { x: 0, y: 100 },
        contentSize: { width: 390, height: 1200 },
        layoutMeasurement: { width: 390, height: 300 },
      },
    })
    await settled()
    expect(callsTo('get', HISTORY_A)).toHaveLength(1)
  })

  it('ở tab Theo lô mà cuộn tới cuối → không gọi lịch sử', async () => {
    stock()
    historyPages()
    await show()
    await scrollToEnd()
    expect(callsTo('get', HISTORY_A)).toHaveLength(0)
  })

  it('trang sau lặp lại dòng đã có (biến động mới chen vào, phân trang offset) → không hiện trùng', async () => {
    stock()
    route('get', HISTORY_A, (config) => {
      const n = Number(config.params?.page ?? 1)
      const items =
        n === 1 ? [historyRow('a'), historyRow('b')] : [historyRow('b'), historyRow('c')]
      return ok({
        items,
        total: 4,
        page: n,
        pageSize: 30,
        totalPages: 2,
        hasNext: n < 2,
        hasPrevios: n > 1,
      })
    })
    await show()
    await openHistory()
    await scrollToEnd()
    expect(callsTo('get', HISTORY_A)).toHaveLength(2)
    expect(screen.getAllByTestId('history-row')).toHaveLength(3)
  })

  it('kéo làm mới ở tab Lịch sử → tải lại cả lịch sử', async () => {
    stock()
    historyPages()
    await show()
    await openHistory()
    const refresh = screen.getByTestId('stock-detail-scroll').props.refreshControl
    await act(async () => refresh.props.onRefresh())
    await settled()
    expect(callsTo('get', HISTORY_A)).toHaveLength(2)
  })
})

describe('DetailTabs', () => {
  it('chạm "Lịch sử" → onChange("history"); chạm tab đang chọn → không gọi', async () => {
    const onChange = jest.fn()
    await render(<DetailTabs value="batches" onChange={onChange} batchCount={3} />)
    expect(screen.getByRole('tab', { name: 'Theo lô · 3' })).toBeSelected()
    await fireEvent.press(screen.getByRole('tab', { name: 'Theo lô · 3' }))
    expect(onChange).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByRole('tab', { name: 'Lịch sử' }))
    expect(onChange).toHaveBeenCalledWith('history')
  })

  it('chưa biết số lô → nhãn "Theo lô"', async () => {
    await render(<DetailTabs value="batches" onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Theo lô' })).toBeOnTheScreen()
  })
})
