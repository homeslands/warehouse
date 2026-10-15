import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import {
  assignMaterialToWarehouse,
  createMaterialInWarehouse,
  fetchInventoryHistory,
  fetchWarehouseInventory,
  removeWarehouseMaterial,
} from './inventory.api'
import type { InventoryItem } from '../model/types'

const BASE = 'http://localhost:8085/api/v1'
const item: InventoryItem = {
  slug: 'inv-1',
  createdAt: '',
  updatedAt: '',
  quantity: 0,
  reservedQuantity: 0,
  availableQuantity: 0,
  minimumInventory: null,
  maximumInventory: null,
  effectiveMinimumInventory: 0,
  effectiveMaximumInventory: 0,
  isBelowMinimum: false,
  isAboveMaximum: false,
  warehouseSlug: 'w-a',
  materialSlug: 'm-1',
  materialCode: 'VT-09',
  materialName: 'Xi măng',
  typeSlug: 'mt-1',
  typeName: 'Vật liệu',
}

describe('inventory.api', () => {
  it('PUT /warehouses/{w}/materials chỉ gửi { materialSlug }', async () => {
    let body: unknown
    server.use(
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, async ({ request }) => {
        body = await request.json()
        return ok(item)
      }),
    )
    expect((await assignMaterialToWarehouse('w-a', 'm-1')).materialSlug).toBe('m-1')
    expect(body).toEqual({ materialSlug: 'm-1' })
  })

  it('POST /warehouses/{w}/materials gửi { material, quantity: 0 }', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/warehouses/w-a/materials`, async ({ request }) => {
        body = await request.json()
        return ok(item)
      }),
    )
    const material = { code: 'VT-09', name: 'Xi măng', typeSlug: 'mt-1', baseUnitSlug: 'u-kg' }
    await createMaterialInWarehouse('w-a', material)
    expect(body).toEqual({ material, quantity: 0 })
  })

  it('GET danh sách gửi đúng bộ lọc, bỏ bộ lọc trống', async () => {
    let url: URL | undefined
    server.use(
      mswHttp.get(`${BASE}/warehouses/w-a/materials`, ({ request }) => {
        url = new URL(request.url)
        return paginated([item])
      }),
    )
    const res = await fetchWarehouseInventory('w-a', {
      page: 2,
      size: 10,
      typeSlug: 'mt-1',
      belowMinimum: true,
      aboveMaximum: undefined,
      code: undefined,
    })
    expect(res.items[0].materialCode).toBe('VT-09')
    expect(url?.searchParams.get('page')).toBe('2')
    expect(url?.searchParams.get('typeSlug')).toBe('mt-1')
    expect(url?.searchParams.get('belowMinimum')).toBe('true')
    expect(url?.searchParams.has('aboveMaximum')).toBe(false)
    expect(url?.searchParams.has('code')).toBe(false)
  })

  it('GET lịch sử của một vật tư', async () => {
    let url: URL | undefined
    server.use(
      mswHttp.get(`${BASE}/warehouses/w-a/materials/m-1/histories`, ({ request }) => {
        url = new URL(request.url)
        return paginated([])
      }),
    )
    await fetchInventoryHistory('w-a', 'm-1', { page: 3, size: 20 })
    expect(url?.searchParams.get('page')).toBe('3')
    expect(url?.searchParams.get('size')).toBe('20')
  })

  it('DELETE gỡ vật tư khỏi kho', async () => {
    let called = false
    server.use(
      mswHttp.delete(`${BASE}/warehouses/w-a/materials/m-1`, () => {
        called = true
        return ok({})
      }),
    )
    await removeWarehouseMaterial('w-a', 'm-1')
    expect(called).toBe(true)
  })
})
