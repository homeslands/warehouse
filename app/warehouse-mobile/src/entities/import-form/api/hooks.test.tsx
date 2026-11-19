import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import {
  useImportConfirmedForms,
  useAvailableMaterials,
  useImportFormSum,
  useImportForms,
} from './hooks'

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
    pageSize: 20,
    totalPages: 1,
    hasNext: false,
    hasPrevios: false,
  })

beforeEach(resetFakeApi)

describe('useImportForms', () => {
  it('key bắt đầu [import-forms, wh] và tải trang đầu', async () => {
    route('get', '/warehouses/wh-1/import-forms', () => list([{ slug: 'f-1' }]))
    const { client, wrapper } = setup()
    const { result } = await renderHook(() => useImportForms('wh-1', { status: 'DRAFT' }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages[0].items).toEqual([{ slug: 'f-1' }])
    expect(client.getQueryCache().getAll()[0].queryKey.slice(0, 2)).toEqual([
      'import-forms',
      'wh-1',
    ])
  })
})

describe('useAvailableMaterials', () => {
  it('query rỗng → không gọi API', async () => {
    const { wrapper } = setup()
    await renderHook(() => useAvailableMaterials('wh-1', '  '), { wrapper })
    expect(callsTo('get', '/warehouses/wh-1/import-forms/available-materials')).toHaveLength(0)
  })

  it('có 1 ký tự → gọi', async () => {
    route('get', '/warehouses/wh-1/import-forms/available-materials', () => list([]))
    const { wrapper } = setup()
    const { result } = await renderHook(() => useAvailableMaterials('wh-1', 'b'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useImportFormSum', () => {
  it('trả sum/count/truncated; tắt khi enabled=false', async () => {
    route('get', '/warehouses/wh-1/import-forms', () =>
      list([
        { slug: 'a', total: 5 },
        { slug: 'b', total: 7 },
      ]),
    )
    const { wrapper } = setup()
    const off = await renderHook(() => useImportFormSum('wh-1', 'CONFIRMED', undefined, false), {
      wrapper,
    })
    expect(off.result.current.fetchStatus).toBe('idle')
    const { result } = await renderHook(
      () =>
        useImportFormSum(
          'wh-1',
          'CONFIRMED',
          { startDate: '2026-11-01', endDate: '2026-11-11' },
          true,
        ),
      { wrapper },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ sum: 12, count: 2, truncated: false })
  })
})

describe('useImportConfirmedForms', () => {
  const r1 = { startDate: '2026-11-01', endDate: '2026-11-12' }
  const r2 = { startDate: '2026-10-01', endDate: '2026-10-31' }

  function gated() {
    let release: () => void = () => {}
    const gate = new Promise<void>((res) => (release = res))
    return { gate, release: () => release() }
  }

  it('đổi range cùng kho → giữ dữ liệu cũ (placeholder); đổi kho → không', async () => {
    const g = gated()
    route('get', '/warehouses/wh-1/import-forms', async (c) => {
      const p = c.params as Record<string, string>
      if (p.startDate === r2.startDate) await g.gate
      return list([{ slug: p.startDate, code: 'C', createdAt: '2026-11-03T10:00:00Z', total: 1 }])
    })
    route('get', '/warehouses/wh-2/import-forms', async () => {
      await g.gate
      return list([])
    })
    const { wrapper } = setup()
    const { result, rerender } = await renderHook(
      ({ wh, range }: { wh: string; range: typeof r1 }) => useImportConfirmedForms(wh, range, true),
      { wrapper, initialProps: { wh: 'wh-1', range: r1 } },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.forms[0].slug).toBe(r1.startDate)

    await rerender({ wh: 'wh-1', range: r2 })
    expect(result.current.isPlaceholderData).toBe(true)
    expect(result.current.data?.forms[0].slug).toBe(r1.startDate)

    await rerender({ wh: 'wh-2', range: r2 })
    expect(result.current.data).toBeUndefined()
    g.release()
  })

  it('enabled=false → không gọi API', async () => {
    const { wrapper } = setup()
    const off = await renderHook(() => useImportConfirmedForms('wh-1', r1, false), { wrapper })
    expect(off.result.current.fetchStatus).toBe('idle')
  })
})
