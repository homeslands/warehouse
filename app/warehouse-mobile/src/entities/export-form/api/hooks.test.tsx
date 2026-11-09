import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { useExportForm, useExportForms, useRecentReceivers } from './hooks'

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
  ok({ items, total: items.length, page: 1, pageSize: 20, totalPages: 1, hasNext: false })

beforeEach(resetFakeApi)

describe('useExportForms', () => {
  it('key bắt đầu [export-forms, wh] và tải trang đầu', async () => {
    route('get', '/warehouses/wh-1/export-forms', () => list([{ slug: 'f-1' }]))
    const { client, wrapper } = setup()
    const { result } = await renderHook(() => useExportForms('wh-1', { type: 'SALE' }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages[0].items).toEqual([{ slug: 'f-1' }])
    expect(client.getQueryCache().getAll()[0].queryKey.slice(0, 2)).toEqual([
      'export-forms',
      'wh-1',
    ])
  })

  it('chưa có kho → không gọi API', async () => {
    const { wrapper } = setup()
    await renderHook(() => useExportForms(undefined), { wrapper })
    expect(callsTo('get', '/warehouses/undefined/export-forms')).toHaveLength(0)
  })
})

describe('useExportForm', () => {
  it('tải chi tiết theo slug', async () => {
    route('get', '/warehouses/wh-1/export-forms/f-1', () => ok({ slug: 'f-1', items: [] }))
    const { wrapper } = setup()
    const { result } = await renderHook(() => useExportForm('wh-1', 'f-1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.slug).toBe('f-1')
  })
})

describe('useRecentReceivers', () => {
  it('GET trang 1, size 50, DESC, mọi trạng thái → người nhận khác nhau, mới nhất trước; key dưới [export-forms, wh]', async () => {
    let params: Record<string, unknown> = {}
    route('get', '/warehouses/wh-1/export-forms', (c) => {
      params = c.params as Record<string, unknown>
      return list([
        { receiver: 'Bếp B', createdAt: '2026-11-05T00:00:00Z' },
        { receiver: 'bếp b', createdAt: '2026-11-04T00:00:00Z' },
        { receiver: 'Tổ hàn A', createdAt: '2026-11-03T00:00:00Z' },
      ])
    })
    const { client, wrapper } = setup()
    const { result } = await renderHook(() => useRecentReceivers('wh-1', true), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(['Bếp B', 'Tổ hàn A'])
    expect(params).toEqual({ page: 1, size: 50, sort: 'DESC' })
    expect(client.getQueryCache().getAll()[0].queryKey.slice(0, 2)).toEqual([
      'export-forms',
      'wh-1',
    ])
  })

  it('chưa bật (ô chưa focus) / chưa có kho → không gọi API', async () => {
    const { wrapper } = setup()
    await renderHook(() => useRecentReceivers('wh-1', false), { wrapper })
    await renderHook(() => useRecentReceivers(undefined, true), { wrapper })
    expect(callsTo('get', '/warehouses/wh-1/export-forms')).toHaveLength(0)
  })
})
