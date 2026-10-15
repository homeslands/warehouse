import { act, waitFor } from '@testing-library/react'
import { http as mswHttp, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import {
  useAssignWarehouseMaterial,
  useCreateWarehouseMaterial,
  useInventoryHistory,
} from './hooks'

const BASE = 'http://localhost:8085/api/v1'
let api: {
  assign?: ReturnType<typeof useAssignWarehouseMaterial>
  create?: ReturnType<typeof useCreateWarehouseMaterial>
} = {}
function Probe() {
  api = { assign: useAssignWarehouseMaterial(), create: useCreateWarehouseMaterial() }
  return null
}

describe('inventory hooks', () => {
  it('gắn / tạo thành công → invalidate tồn của kho', async () => {
    server.use(
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => ok({ materialSlug: 'm-1' })),
      mswHttp.post(`${BASE}/warehouses/w-a/materials`, () => ok({ materialSlug: 'm-2' })),
    )
    const { queryClient } = renderWithProviders(<Probe />)
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    await act(() => api.assign!.mutateAsync({ warehouseSlug: 'w-a', materialSlug: 'm-1' }))
    await act(() =>
      api.create!.mutateAsync({
        warehouseSlug: 'w-a',
        material: { code: 'VT-1', name: 'A', typeSlug: 't', baseUnitSlug: 'u' },
      }),
    )
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['inventory', 'w-a'] })
  })

  it('useInventoryHistory: trang 1 rồi fetchNextPage lấy trang 2 khi hasNext', async () => {
    const pages: string[] = []
    server.use(
      mswHttp.get(`${BASE}/warehouses/w-a/materials/m-1/histories`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        pages.push(page)
        return HttpResponse.json({
          message: 'ok',
          statusCode: 200,
          timestamp: '',
          result: {
            items: [],
            total: 25,
            page: Number(page),
            pageSize: 20,
            totalPages: 2,
            hasNext: page === '1',
            hasPrevios: page === '2',
          },
        })
      }),
    )
    let history: ReturnType<typeof useInventoryHistory> | undefined
    function HistoryProbe() {
      history = useInventoryHistory('w-a', 'm-1')
      return null
    }
    renderWithProviders(<HistoryProbe />)
    await waitFor(() => expect(history?.isSuccess).toBe(true))
    expect(history?.hasNextPage).toBe(true)
    await act(() => history!.fetchNextPage())
    await waitFor(() => expect(pages).toEqual(['1', '2']))
    await waitFor(() => expect(history?.hasNextPage).toBe(false))
  })

  it('useInventoryHistory: materialSlug null → không gọi API', async () => {
    let called = false
    server.use(
      mswHttp.get(`${BASE}/warehouses/w-a/materials/:m/histories`, () => {
        called = true
        return HttpResponse.json({})
      }),
    )
    function NullProbe() {
      useInventoryHistory('w-a', null)
      return null
    }
    renderWithProviders(<NullProbe />)
    await new Promise((r) => setTimeout(r, 50))
    expect(called).toBe(false)
  })
})
