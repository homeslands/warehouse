import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import {
  assignWarehouseManager,
  createWarehouse,
  fetchMyWarehouses,
  fetchWarehouse,
  fetchWarehouses,
  removeWarehouse,
  updateWarehouse,
} from './warehouse.api'
import type { Warehouse } from '../model/types'

const BASE = 'http://localhost:8085/api/v1'

const warehouse: Warehouse = {
  slug: 'kho-ha-noi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  name: 'Kho Hà Nội 1',
  code: 'WH-HN-01',
  address: 'Số 1, Cầu Giấy, Hà Nội',
  isActive: true,
}

describe('fetchWarehouses', () => {
  it('gửi page/size và bộ lọc có giá trị, bỏ bộ lọc rỗng', async () => {
    let query = ''
    server.use(
      mswHttp.get(`${BASE}/warehouses`, ({ request }) => {
        query = new URL(request.url).searchParams.toString()
        return paginated([warehouse])
      }),
    )

    const result = await fetchWarehouses({
      page: 2,
      size: 20,
      isActive: false,
      managerSlug: '',
      hasManager: undefined,
    })

    expect(query).toBe(new URLSearchParams({ page: '2', size: '20', isActive: 'false' }).toString())
    expect(result.items).toEqual([warehouse])
  })

  it('hasManager=false đi đúng thành "false" trên URL, không bị bỏ như giá trị rỗng', async () => {
    let query = ''
    server.use(
      mswHttp.get(`${BASE}/warehouses`, ({ request }) => {
        query = new URL(request.url).searchParams.toString()
        return paginated([])
      }),
    )

    await fetchWarehouses({ page: 1, size: 10, hasManager: false })

    expect(query).toBe(
      new URLSearchParams({ page: '1', size: '10', hasManager: 'false' }).toString(),
    )
  })
})

describe('createWarehouse', () => {
  it('POST /warehouses với đúng body của form', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/warehouses`, async ({ request }) => {
        body = await request.json()
        return ok(warehouse)
      }),
    )

    await createWarehouse({
      code: 'WH-HN-01',
      name: 'Kho Hà Nội 1',
      address: 'Số 1, Cầu Giấy, Hà Nội',
      isActive: true,
    })

    expect(body).toEqual({
      code: 'WH-HN-01',
      name: 'Kho Hà Nội 1',
      address: 'Số 1, Cầu Giấy, Hà Nội',
      isActive: true,
    })
  })
})

describe('updateWarehouse', () => {
  it('PATCH /warehouses/:slug chỉ gửi trường đổi — KHÔNG kèm version (backend bỏ version ở WMS-10-be(2))', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${BASE}/warehouses/kho-ha-noi`, async ({ request }) => {
        body = await request.json()
        return ok({ ...warehouse, isActive: false })
      }),
    )

    await updateWarehouse('kho-ha-noi', { isActive: false })

    expect(body).toEqual({ isActive: false })
  })
})

describe('removeWarehouse', () => {
  it('DELETE /warehouses/:slug', async () => {
    let called = false
    server.use(
      mswHttp.delete(`${BASE}/warehouses/kho-ha-noi`, () => {
        called = true
        return ok('1 warehouse have been deleted successfully')
      }),
    )

    await expect(removeWarehouse('kho-ha-noi')).resolves.toBe(
      '1 warehouse have been deleted successfully',
    )
    expect(called).toBe(true)
  })
})

describe('assignWarehouseManager', () => {
  it('PUT /warehouses/:slug/manager gửi đúng managerSlug, không kèm version', async () => {
    let body: unknown
    server.use(
      mswHttp.put(`${BASE}/warehouses/kho-ha-noi/manager`, async ({ request }) => {
        body = await request.json()
        return ok(warehouse)
      }),
    )

    await assignWarehouseManager('kho-ha-noi', { managerSlug: 'u-manager' })

    expect(body).toEqual({ managerSlug: 'u-manager' })
  })

  it('bỏ gán gửi managerSlug: null — KHÔNG được bỏ field hay gửi chuỗi rỗng', async () => {
    let body: unknown
    server.use(
      mswHttp.put(`${BASE}/warehouses/kho-ha-noi/manager`, async ({ request }) => {
        body = await request.json()
        return ok({ ...warehouse, managerSlug: undefined })
      }),
    )

    await assignWarehouseManager('kho-ha-noi', { managerSlug: null })

    expect(body).toEqual({ managerSlug: null })
  })
})

describe('fetchWarehouse / fetchMyWarehouses', () => {
  it('GET /warehouses/:slug trả đúng bản ghi', async () => {
    server.use(mswHttp.get(`${BASE}/warehouses/kho-ha-noi`, () => ok(warehouse)))

    await expect(fetchWarehouse('kho-ha-noi')).resolves.toEqual(warehouse)
  })

  it('GET /warehouses/mine gửi page/size/isActive', async () => {
    let query = new URLSearchParams()
    server.use(
      mswHttp.get(`${BASE}/warehouses/mine`, ({ request }) => {
        query = new URL(request.url).searchParams
        return paginated([warehouse], { page: 2, size: 20 })
      }),
    )

    const result = await fetchMyWarehouses({ page: 2, size: 20, isActive: true })

    expect(query.get('page')).toBe('2')
    expect(query.get('size')).toBe('20')
    expect(query.get('isActive')).toBe('true')
    expect(result.items).toEqual([warehouse])
  })
})
