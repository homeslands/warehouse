import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { assignMaterialToWarehouse, createMaterialInWarehouse } from './inventory.api'
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
})
