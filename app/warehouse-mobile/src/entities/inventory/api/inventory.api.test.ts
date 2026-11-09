import { failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { item } from '../model/fixtures'
import {
  fetchAllInventory,
  fetchInventoryHistory,
  fetchMaterialBatches,
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
