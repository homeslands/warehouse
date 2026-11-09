import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { item } from '../model/fixtures'
import { useInventory, useInventoryHistory, useInventoryItem } from './hooks'

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

const list = (items: object[]) =>
  ok({
    items,
    total: items.length,
    page: 1,
    pageSize: 100,
    totalPages: 1,
    hasNext: false,
    hasPrevios: false,
  })

beforeEach(resetFakeApi)

describe('useInventory', () => {
  it('đổi kho khi kho cũ đang tải: không bao giờ trả dữ liệu kho cũ', async () => {
    let releaseA!: () => void
    const gateA = new Promise<void>((r) => (releaseA = r))
    route('get', '/warehouses/A/materials', async () => {
      await gateA
      return list([item({ slug: 'a', warehouseSlug: 'A' })])
    })
    route('get', '/warehouses/B/materials', async () => {
      await new Promise((r) => setTimeout(r, 20))
      return list([item({ slug: 'b', warehouseSlug: 'B' })])
    })
    const { wrapper } = setup()
    const seen: (string[] | undefined)[] = []
    const { result, rerender } = await renderHook(
      ({ wh }: { wh: string }) => {
        const q = useInventory(wh)
        seen.push(q.data?.map((i) => i.slug))
        return q
      },
      { wrapper, initialProps: { wh: 'A' } },
    )
    await rerender({ wh: 'B' })
    expect(result.current.data).toBeUndefined()
    await act(async () => releaseA())
    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(result.current.data?.[0].slug).toBe('b'))
    expect(seen.flat()).not.toContain('a')
  })

  it('không chạy khi chưa có kho', async () => {
    const { wrapper } = setup()
    const { result } = await renderHook(() => useInventory(undefined), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('useInventoryItem', () => {
  it('đọc từ cache danh sách, không gọi mạng', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(['inventory', 'wh-1', 'list', {}], [item({ materialSlug: 'm1' })])
    const { result } = await renderHook(() => useInventoryItem('wh-1', 'm1'), { wrapper })
    await waitFor(() => expect(result.current.data?.materialSlug).toBe('m1'))
  })

  it('không có cache thì lấy từ danh sách tải mới', async () => {
    route('get', '/warehouses/wh-1/materials', () => list([item({ materialSlug: 'm2' })]))
    const { wrapper } = setup()
    const { result } = await renderHook(() => useInventoryItem('wh-1', 'm2'), { wrapper })
    await waitFor(() => expect(result.current.data?.materialSlug).toBe('m2'))
  })
})

describe('useInventoryHistory', () => {
  it('fetchNextPage theo hasNext', async () => {
    route('get', '/warehouses/wh-1/materials/m/histories', (config) => {
      const page = (config.params as { page: number }).page
      return ok({
        items: [{ slug: `h${page}` }],
        total: 2,
        page,
        pageSize: 30,
        totalPages: 2,
        hasNext: page === 1,
        hasPrevios: page > 1,
      })
    })
    const { wrapper } = setup()
    const { result } = await renderHook(() => useInventoryHistory('wh-1', 'm'), { wrapper })
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
    expect(result.current.hasNextPage).toBe(false)
  })
})
