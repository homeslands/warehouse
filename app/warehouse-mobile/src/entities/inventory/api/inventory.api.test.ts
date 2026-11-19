import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { item } from '../model/fixtures'
import { inventoryKeys } from './query-keys'
import {
  assignMaterialToWarehouse,
  createMaterialInWarehouse,
  fetchAllInventory,
  fetchBatchCount,
  fetchExpiringBatches,
  fetchInventoryHistory,
  fetchMaterialBatches,
  removeMaterialFromWarehouse,
  updateInventoryThresholds,
} from './inventory.api'

type Params = Record<string, unknown>
const seen: Params[] = []

const pageOf = (
  page: number,
  count: number,
  hasNext: boolean,
  make = (i: number) => item({ slug: `i-${page}-${i}` }),
) =>
  ok({
    items: Array.from({ length: count }, (_, i) => make(i)),
    total: 0,
    page,
    pageSize: 100,
    totalPages: 0,
    hasNext,
    hasPrevios: page > 1,
  })

beforeEach(() => {
  resetFakeApi()
  seen.length = 0
})

describe('fetchAllInventory', () => {
  it('tải hết các trang với size=100', async () => {
    const counts = [100, 100, 37]
    route('get', '/warehouses/wh-1/materials', (config) => {
      seen.push(config.params as Params)
      const page = (config.params as Params).page as number
      return pageOf(page, counts[page - 1], page < 3)
    })
    const all = await fetchAllInventory('wh-1')
    expect(all).toHaveLength(237)
    expect(seen.map((p) => p.page)).toEqual([1, 2, 3])
    expect(seen.every((p) => p.size === 100)).toBe(true)
  })

  it('gửi bộ lọc belowMinimum / aboveMaximum', async () => {
    route('get', '/warehouses/wh-1/materials', (config) => {
      seen.push(config.params as Params)
      return pageOf(1, 1, false)
    })
    await fetchAllInventory('wh-1', { belowMinimum: true })
    expect(seen[0].belowMinimum).toBe(true)
    expect(seen[0]).not.toHaveProperty('aboveMaximum')
  })

  it('một trang lỗi thì reject, không trả nửa vời', async () => {
    route('get', '/warehouses/wh-1/materials', (config) => {
      const page = (config.params as Params).page as number
      return page === 2 ? failure(500) : pageOf(page, 100, true)
    })
    await expect(fetchAllInventory('wh-1')).rejects.toBeDefined()
  })

  it('quá 50 trang thì ném inventory-too-many-pages', async () => {
    route('get', '/warehouses/wh-1/materials', (config) => {
      seen.push(config.params as Params)
      return pageOf((config.params as Params).page as number, 1, true)
    })
    await expect(fetchAllInventory('wh-1')).rejects.toThrow('inventory-too-many-pages')
    expect(seen).toHaveLength(50)
  })
})

describe('fetchMaterialBatches', () => {
  it('gửi status=1, sortBy=expiryDate, ASC và đưa lô không hạn xuống cuối', async () => {
    const batch = (slug: string, expiryDate: string | null) => ({ slug, expiryDate })
    route('get', '/warehouses/wh-1/material-batches', (config) => {
      seen.push(config.params as Params)
      const page = (config.params as Params).page as number
      return page === 1
        ? ok({ items: [batch('none', null), batch('a', '2026-01-01')], hasNext: true })
        : ok({ items: [batch('b', '2026-02-01')], hasNext: false })
    })
    const rows = await fetchMaterialBatches('wh-1', 'mat-1')
    expect(rows.map((r) => r.slug)).toEqual(['a', 'b', 'none'])
    expect(seen[0]).toMatchObject({
      materialSlug: 'mat-1',
      status: 1,
      sortBy: 'expiryDate',
      sort: 'ASC',
    })
    expect(seen).toHaveLength(2)
  })
})

describe('fetchMaterialBatches — inStockOnly', () => {
  it('inStockOnly=false → không gửi status (lô hết hàng cũng có để chọn)', async () => {
    const seen: Params[] = []
    route('get', '/warehouses/wh-1/material-batches', (config) => {
      seen.push(config.params as Params)
      return ok({ items: [{ slug: 'a', expiryDate: null }], hasNext: false })
    })
    await fetchMaterialBatches('wh-1', 'mat-1', { inStockOnly: false })
    expect(seen[0]).toMatchObject({ materialSlug: 'mat-1', sortBy: 'expiryDate', sort: 'ASC' })
    expect(seen[0]).not.toHaveProperty('status')
  })
})

describe('fetchInventoryHistory', () => {
  it('gửi page, size=30, sort=DESC', async () => {
    route('get', '/warehouses/wh-1/materials/mat-1/histories', (config) => {
      seen.push(config.params as Params)
      return ok({
        items: [],
        total: 0,
        page: 3,
        pageSize: 30,
        totalPages: 3,
        hasNext: false,
        hasPrevios: true,
      })
    })
    const res = await fetchInventoryHistory('wh-1', 'mat-1', 3)
    expect(seen[0]).toMatchObject({ page: 3, size: 30, sort: 'DESC' })
    expect(res.hasPrevious).toBe(true)
  })
})

describe('updateInventoryThresholds', () => {
  it('PATCH đúng path + body, trả dòng tồn', async () => {
    let body: unknown
    route('patch', '/warehouses/wh1/materials/m1', (config) => {
      body = JSON.parse(config.data as string)
      return ok(item({ slug: 'r', maximumInventory: null }))
    })
    const res = await updateInventoryThresholds('wh1', 'm1', { maximumInventory: null })
    expect(body).toEqual({ maximumInventory: null })
    expect(res.slug).toBe('r')
  })
})

describe('assign / remove material', () => {
  it('PUT /warehouses/:w/materials với body đúng', async () => {
    route('put', '/warehouses/kho-a/materials', () => ok(item({ slug: 'r' })))
    const res = await assignMaterialToWarehouse('kho-a', {
      materialSlug: 'm1',
      minimumInventory: 2,
    })
    const [call] = callsTo('put', '/warehouses/kho-a/materials')
    expect(call.body).toBe('{"materialSlug":"m1","minimumInventory":2}')
    expect(res.slug).toBe('r')
  })
  it('DELETE /warehouses/:w/materials/:m', async () => {
    route('delete', '/warehouses/kho-a/materials/m1', () => ok(null))
    await removeMaterialFromWarehouse('kho-a', 'm1')
    expect(callsTo('delete', '/warehouses/kho-a/materials/m1')).toHaveLength(1)
  })
})

describe('createMaterialInWarehouse', () => {
  it('POST /warehouses/:w/materials với { material, supplierSlug }, không có quantity', async () => {
    route('post', '/warehouses/kho-a/materials', () => ok(item({ slug: 'new' })))
    const material = { code: 'SP01', name: 'Gạo', typeSlug: 'tp', baseUnitSlug: 'kg' }
    const res = await createMaterialInWarehouse('kho-a', { material, supplierSlug: 's1' })
    const [call] = callsTo('post', '/warehouses/kho-a/materials')
    expect(JSON.parse(call.body as string)).toEqual({ material, supplierSlug: 's1' })
    expect(call.body).not.toContain('quantity')
    expect(res.slug).toBe('new')
  })
  it('không có bên bán → body chỉ { material }', async () => {
    route('post', '/warehouses/kho-a/materials', () => ok(item()))
    const material = { code: 'SP01', name: 'Gạo', typeSlug: 'tp', baseUnitSlug: 'kg' }
    await createMaterialInWarehouse('kho-a', { material })
    const [call] = callsTo('post', '/warehouses/kho-a/materials')
    expect(JSON.parse(call.body as string)).toEqual({ material })
  })
})

describe('fetchBatchCount / fetchExpiringBatches', () => {
  const BATCHES = '/warehouses/wh-1/material-batches'
  const pg = (total: number) =>
    ok({ items: [], total, page: 1, pageSize: 1, totalPages: total, hasNext: false })

  it('fetchBatchCount gửi status=1,size=1,expiryBefore và trả total', async () => {
    const got: Params[] = []
    route('get', BATCHES, (c) => {
      got.push(c.params as Params)
      return pg(9)
    })
    expect(await fetchBatchCount('wh-1', '2026-11-11')).toBe(9)
    expect(got[0]).toMatchObject({ status: 1, size: 1, expiryBefore: '2026-11-11' })
  })

  it('fetchExpiringBatches sắp theo expiryDate ASC, size 50, đúng trang', async () => {
    const got: Params[] = []
    route('get', BATCHES, (c) => {
      got.push(c.params as Params)
      return pg(0)
    })
    await fetchExpiringBatches('wh-1', '2027-01-11', 2)
    expect(got[0]).toMatchObject({
      status: 1,
      sortBy: 'expiryDate',
      sort: 'ASC',
      size: 50,
      page: 2,
      expiryBefore: '2027-01-11',
    })
  })

  it('inventoryKeys.expiry khác theo kho và ngày, nằm dưới kho', () => {
    expect(inventoryKeys.expiryCount('a', '2026-11-11')).toEqual([
      'inventory',
      'a',
      'expiry',
      'count',
      '2026-11-11',
    ])
    expect(inventoryKeys.expiring('a', '2026-11-11')).toEqual([
      'inventory',
      'a',
      'expiry',
      'list',
      '2026-11-11',
    ])
    expect(inventoryKeys.expiring('a', 'x')).not.toEqual(inventoryKeys.expiring('b', 'x'))
    expect(inventoryKeys.expiryCount('a', 'x').slice(0, 2)).toEqual(inventoryKeys.warehouse('a'))
  })
})
