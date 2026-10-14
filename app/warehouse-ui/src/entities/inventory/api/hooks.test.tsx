import { act, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { useAssignWarehouseMaterial, useCreateWarehouseMaterial } from './hooks'

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
})
