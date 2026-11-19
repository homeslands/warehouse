import { failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { ScrollView, type ScrollViewInstance } from 'react-native'

import { expiryCutoffs, inventoryKeys, type MaterialBatch } from '@/entities/inventory'
import { item } from '@/entities/inventory/model/fixtures'
import { useWarehouseStore } from '@/entities/warehouse'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { pressSheetCancel, sheetHeader } from '@/shared/ui/testing/sheet-header'

import { ExpiryBatchesSheetScreen } from './ExpiryBatchesSheetScreen'

const mockBack = jest.fn()
const mockPush = jest.fn()
let mockFocus: string | undefined
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    canGoBack: () => true,
    replace: jest.fn(),
  }),
  useLocalSearchParams: () => ({ focus: mockFocus }),
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

// Chỉ giả `Date` (hôm nay = 2026-11-11); hẹn giờ thật để react-query / render chạy bình thường.
const NOW = new Date(2026, 10, 11, 9, 0, 0)
const CUTOFF = expiryCutoffs(NOW).soon

function batch(over: Partial<MaterialBatch>): MaterialBatch {
  return {
    slug: 'b-1',
    entryDate: '2026-10-01',
    expiryDate: '2026-11-20',
    quantity: 100,
    remainingQuantity: 40,
    reservedQuantity: 0,
    availableQuantity: 40,
    status: 1,
    materialSlug: 'xm',
    baseUnit: { slug: 'u-bag', code: 'BAG', name: 'Bao' },
    ...over,
  }
}

const BATCHES = [
  batch({ slug: 'b-1', expiryDate: '2026-11-05', materialSlug: 'xm' }),
  batch({ slug: 'b-2', expiryDate: '2026-11-20', materialSlug: 'sn', remainingQuantity: 7 }),
  batch({ slug: 'b-3', expiryDate: '2026-12-30', materialSlug: 'la-lat' }),
]

const page = (items: MaterialBatch[], over = {}) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 50,
  totalPages: 1,
  hasNext: false,
  hasPrevios: false,
  ...over,
})

let client: QueryClient

/** Truy vấn đếm xin 1 phần tử (số đếm tiêu đề nhóm); danh sách xin 50. */
const isCount = (config: { params?: unknown }) => (config.params as { size: number }).size === 1

function seedCounts(expired: number, beforeSoon: number) {
  const { expired: e, soon } = expiryCutoffs(NOW)
  client.setQueryData(inventoryKeys.expiryCount('wh-a', e), expired)
  client.setQueryData(inventoryKeys.expiryCount('wh-a', soon), beforeSoon)
}

function seed(items: MaterialBatch[]) {
  client.setQueryData(inventoryKeys.expiring('wh-a', CUTOFF), {
    pages: [page(items)],
    pageParams: [1],
  })
}

async function show() {
  await render(
    <QueryClientProvider client={client}>
      <ExpiryBatchesSheetScreen />
    </QueryClientProvider>,
  )
}

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  jest.clearAllMocks()
  resetFakeApi()
  mockFocus = undefined
  jest.useFakeTimers({ now: NOW })
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  client.setQueryData(inventoryKeys.list('wh-a'), [
    item({ materialSlug: 'xm', materialCode: 'VT-XM', materialName: 'Xi măng' }),
    item({ slug: 'i-2', materialSlug: 'sn', materialCode: 'VT-SN', materialName: 'Sơn Dulux' }),
  ])
  useWarehouseStore.setState({
    current: { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true },
    resolved: true,
    resolution: 'selected',
  })
})

afterEach(() => {
  client.clear()
  jest.useRealTimers()
})

describe('ExpiryBatchesSheetScreen', () => {
  it('tiêu đề "Hạn dùng", chỉ có ✕; nhóm Quá hạn (1) và Sắp hết hạn (2) với số ngày', async () => {
    seed(BATCHES)
    await show()
    expect(sheetHeader().title).toBe('Hạn dùng')
    expect(sheetHeader().done).toBeUndefined()
    expect(screen.getByRole('header', { name: 'Quá hạn' })).toBeOnTheScreen()
    expect(screen.getByRole('header', { name: 'Sắp hết hạn' })).toBeOnTheScreen()
    expect(screen.getByText(/quá 6 ngày/)).toBeOnTheScreen()
    expect(screen.getByText(/còn 9 ngày/)).toBeOnTheScreen()
    expect(screen.getByText(/còn 49 ngày/)).toBeOnTheScreen()
    expect(screen.getByText('Xi măng')).toBeOnTheScreen()
    expect(screen.getByText('Sơn Dulux')).toBeOnTheScreen()
    expect(screen.getByText('VT-XM')).toBeOnTheScreen()
  })

  it('tiêu đề nhóm kèm số lô từ endpoint đếm: Quá hạn = đếm(hôm nay), Sắp hết hạn = đếm(+61) − đếm(hôm nay)', async () => {
    seed(BATCHES)
    seedCounts(2, 5)
    await show()
    expect(screen.getByRole('header', { name: 'Quá hạn · 2' })).toBeOnTheScreen()
    expect(screen.getByRole('header', { name: 'Sắp hết hạn · 3' })).toBeOnTheScreen()
  })

  it('đếm sắp hết hạn âm (dữ liệu lệch) → kẹp về 0', async () => {
    seed(BATCHES)
    seedCounts(4, 3)
    await show()
    expect(screen.getByRole('header', { name: 'Sắp hết hạn · 0' })).toBeOnTheScreen()
  })

  it('lô có vật tư không nằm trong tồn đã tải: vẫn hiện bằng slug, không crash', async () => {
    seed(BATCHES)
    await show()
    expect(screen.getByText('la-lat')).toBeOnTheScreen()
  })

  it('chạm một dòng: đóng sheet rồi mở /stock/<materialSlug>', async () => {
    seed(BATCHES)
    await show()
    await fireEvent.press(screen.getByText('Sơn Dulux'))
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/stock/[materialSlug]',
      params: { materialSlug: 'sn' },
    })
    expect(mockBack.mock.invocationCallOrder[0]).toBeLessThan(mockPush.mock.invocationCallOrder[0])
    // Chạm tiếp lúc đang trượt đóng: không đóng / điều hướng lần hai.
    await fireEvent.press(screen.getByText('Xi măng'))
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledTimes(1)
  })

  it('✕ đóng sheet', async () => {
    seed(BATCHES)
    await show()
    await pressSheetCancel()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('không có lô nào: chữ trạng thái trống', async () => {
    seed([])
    await show()
    expect(screen.getByText('Không có lô nào quá hạn hoặc sắp hết hạn')).toBeOnTheScreen()
    expect(screen.queryByRole('header', { name: 'Quá hạn' })).toBeNull()
  })

  it('lỗi tải: "Thử lại" gọi lại và hiện danh sách', async () => {
    let calls = 0
    route('get', '/warehouses/wh-a/material-batches', (config) => {
      if (isCount(config)) return ok(page([], { total: 0 }))
      calls += 1
      return calls === 1 ? failure(500) : ok(page(BATCHES))
    })
    await show()
    await act(() => jest.advanceTimersByTimeAsync(10))
    expect(screen.getByText('Không tải được danh sách lô')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    await act(() => jest.advanceTimersByTimeAsync(10))
    expect(calls).toBe(2)
    expect(screen.getByText('Sơn Dulux')).toBeOnTheScreen()
  })

  it('focus=soon: cuộn tới nhóm Sắp hết hạn', async () => {
    seed(BATCHES)
    mockFocus = 'soon'
    const scrollTo = jest.spyOn(ScrollView.prototype as unknown as ScrollViewInstance, 'scrollTo')
    await show()
    await fireEvent(screen.getByTestId('expiry-section-soon'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 180, width: 300, height: 200 } },
    })
    expect(scrollTo).toHaveBeenCalledWith({ y: 180, animated: false })
  })

  it('focus=soon, trang 1 toàn lô quá hạn: tự tải trang 2 rồi mới cuộn tới nhóm Sắp hết hạn', async () => {
    mockFocus = 'soon'
    const pages: number[] = []
    route('get', '/warehouses/wh-a/material-batches', (config) => {
      if (isCount(config)) return ok(page([], { total: 0 }))
      const n = (config.params as { page: number }).page
      pages.push(n)
      return n === 1
        ? ok(page([BATCHES[0]], { hasNext: true, totalPages: 2 }))
        : ok(page([BATCHES[1]], { page: 2, totalPages: 2 }))
    })
    const scrollTo = jest.spyOn(ScrollView.prototype as unknown as ScrollViewInstance, 'scrollTo')
    await show()
    await act(() => jest.advanceTimersByTimeAsync(100))
    expect(pages).toEqual([1, 2])
    await act(() => jest.advanceTimersByTimeAsync(100))
    expect(scrollTo).not.toHaveBeenCalled()
    await fireEvent(screen.getByTestId('expiry-section-soon'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 240, width: 300, height: 100 } },
    })
    expect(scrollTo).toHaveBeenCalledWith({ y: 240, animated: false })
  })

  it('các trang đã tải không có dòng nào mà còn trang sau: hiện vòng quay và tự tải tiếp', async () => {
    const pages: number[] = []
    route('get', '/warehouses/wh-a/material-batches', (config) => {
      if (isCount(config)) return ok(page([], { total: 0 }))
      const n = (config.params as { page: number }).page
      pages.push(n)
      return n === 1
        ? ok(page([], { hasNext: true, totalPages: 2 }))
        : ok(page([BATCHES[1]], { page: 2, totalPages: 2 }))
    })
    await show()
    await act(() => jest.advanceTimersByTimeAsync(100))
    expect(pages).toEqual([1, 2])
    await act(() => jest.advanceTimersByTimeAsync(100))
    expect(screen.getByText('Sơn Dulux')).toBeOnTheScreen()
  })
})
