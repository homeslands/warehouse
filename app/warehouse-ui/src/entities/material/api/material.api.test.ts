import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import {
  attachConversionUnit,
  createMaterial,
  detachConversionUnit,
  fetchAvailableUnits,
  fetchConversionUnits,
  fetchMaterial,
  fetchMaterials,
  removeMaterial,
  updateConversionUnit,
  updateMaterial,
} from './material.api'
import type { Material, MaterialConversionUnit } from '../model/types'

const BASE = 'http://localhost:8085/api/v1'

const material: Material = {
  slug: 'm-1',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  code: 'VT-01',
  name: 'Xi măng',
  minimumInventory: 10,
  maximumInventory: 100,
  type: { slug: 'mt-1', code: 'MT-01', name: 'Vật liệu xây dựng' },
  baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' },
  hasSupplier: false,
  suppliers: [],
}
const bag: MaterialConversionUnit = {
  unitSlug: 'u-bag',
  unitCode: 'BAG',
  unitName: 'Bao 50kg',
  conversionRate: 50,
  isBaseUnit: false,
}

describe('material.api', () => {
  it('GET /materials gửi page/size (+ typeSlug khi có)', async () => {
    let query = ''
    server.use(
      mswHttp.get(`${BASE}/materials`, ({ request }) => {
        query = new URL(request.url).searchParams.toString()
        return paginated([material])
      }),
    )

    const result = await fetchMaterials({ page: 1, size: 100 })
    expect(query).toBe(new URLSearchParams({ page: '1', size: '100' }).toString())
    expect(result.items).toEqual([material])

    await fetchMaterials({ page: 1, size: 10, typeSlug: 'mt-1' })
    expect(new URLSearchParams(query).get('typeSlug')).toBe('mt-1')
  })

  it('CRUD vật tư đúng URL và body', async () => {
    const seen: { method: string; path: string; body: unknown }[] = []
    const record = async ({ request }: { request: Request }) => {
      const body =
        request.method === 'GET' || request.method === 'DELETE' ? null : await request.json()
      seen.push({ method: request.method, path: new URL(request.url).pathname, body })
      return ok(request.method === 'DELETE' ? 'm-1' : material)
    }
    server.use(
      mswHttp.get(`${BASE}/materials/m-1`, record),
      mswHttp.post(`${BASE}/materials`, record),
      mswHttp.patch(`${BASE}/materials/m-1`, record),
      mswHttp.delete(`${BASE}/materials/m-1`, record),
    )

    await fetchMaterial('m-1')
    await createMaterial({ code: 'vt-01', name: 'Xi măng', typeSlug: 'mt-1', baseUnitSlug: 'u-kg' })
    await updateMaterial('m-1', { maximumInventory: 200 })
    await removeMaterial('m-1')

    expect(seen).toEqual([
      { method: 'GET', path: '/api/v1/materials/m-1', body: null },
      {
        method: 'POST',
        path: '/api/v1/materials',
        body: { code: 'vt-01', name: 'Xi măng', typeSlug: 'mt-1', baseUnitSlug: 'u-kg' },
      },
      { method: 'PATCH', path: '/api/v1/materials/m-1', body: { maximumInventory: 200 } },
      { method: 'DELETE', path: '/api/v1/materials/m-1', body: null },
    ])
  })

  it('đơn vị quy đổi: list / available / attach / patch / detach', async () => {
    const seen: string[] = []
    server.use(
      mswHttp.get(`${BASE}/materials/m-1/conversion-units`, ({ request }) => {
        seen.push(`GET list ${new URL(request.url).searchParams.get('page')}`)
        return paginated([bag])
      }),
      mswHttp.get(`${BASE}/materials/m-1/conversion-units/available`, () => {
        seen.push('GET available')
        return paginated([{ slug: 'u-box', code: 'BOX', name: 'Thùng' }])
      }),
      mswHttp.post(`${BASE}/materials/m-1/conversion-units`, async ({ request }) => {
        seen.push(`POST ${JSON.stringify(await request.json())}`)
        return ok(bag)
      }),
      mswHttp.patch(`${BASE}/materials/m-1/conversion-units/u-bag`, async ({ request }) => {
        seen.push(`PATCH ${JSON.stringify(await request.json())}`)
        return ok(bag)
      }),
      mswHttp.delete(`${BASE}/materials/m-1/conversion-units/u-bag`, () => {
        seen.push('DELETE')
        return ok('u-bag')
      }),
    )

    expect((await fetchConversionUnits('m-1', { page: 1, size: 10 })).items).toEqual([bag])
    expect((await fetchAvailableUnits('m-1', { page: 1, size: 100 })).items[0].code).toBe('BOX')
    await attachConversionUnit('m-1', { unitSlug: 'u-bag', conversionRate: 50 })
    await updateConversionUnit('m-1', 'u-bag', { conversionRate: 25.5 })
    await detachConversionUnit('m-1', 'u-bag')

    expect(seen).toEqual([
      'GET list 1',
      'GET available',
      'POST {"unitSlug":"u-bag","conversionRate":50}',
      'PATCH {"conversionRate":25.5}',
      'DELETE',
    ])
  })
})
