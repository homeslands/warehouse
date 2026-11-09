import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { useAvailableMaterials, useImportForms } from './hooks'

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
