import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import {
  assignStoreWarehouse,
  createStore,
  fetchStore,
  fetchStores,
  removeStore,
  updateStore,
} from './store.api'
import type { Store } from '../model/types'

const BASE = 'http://localhost:8085/api/v1'

const store: Store = {
  slug: 'ch-ha-noi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  name: 'Cửa hàng Hà Nội 1',
  code: 'ST-HN-01',
  legalName: 'Công ty TNHH ABC',
  taxCode: '0101234567',
  isActive: true,
}

describe('fetchStores', () => {
  it('gửi page/size và isActive, bỏ bộ lọc rỗng', async () => {
    let query = ''
    server.use(
      mswHttp.get(`${BASE}/stores`, ({ request }) => {
        query = new URL(request.url).searchParams.toString()
        return paginated([store])
      }),
    )

    const result = await fetchStores({ page: 1, size: 10, isActive: true })

    expect(query).toBe(new URLSearchParams({ page: '1', size: '10', isActive: 'true' }).toString())
    expect(result.items).toEqual([store])
  })

  it('không lọc thì chỉ gửi page/size', async () => {
    let query = ''
    server.use(
      mswHttp.get(`${BASE}/stores`, ({ request }) => {
        query = new URL(request.url).searchParams.toString()
        return paginated([])
      }),
    )

    await fetchStores({ page: 1, size: 10, isActive: undefined })

    expect(query).toBe(new URLSearchParams({ page: '1', size: '10' }).toString())
  })
})

describe('createStore', () => {
  it('POST /stores với đúng body của form', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/stores`, async ({ request }) => {
        body = await request.json()
        return ok(store)
      }),
    )

    await createStore({
      code: 'ST-HN-01',
      name: 'Cửa hàng Hà Nội 1',
      legalName: 'Công ty TNHH ABC',
      taxCode: '0101234567',
      isActive: true,
    })

    expect(body).toEqual({
      code: 'ST-HN-01',
      name: 'Cửa hàng Hà Nội 1',
      legalName: 'Công ty TNHH ABC',
      taxCode: '0101234567',
      isActive: true,
    })
  })
})

describe('updateStore', () => {
  it('PATCH /stores/:slug chỉ gửi trường đổi — KHÔNG kèm version (backend bỏ version ở WMS-10-be(2))', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${BASE}/stores/ch-ha-noi`, async ({ request }) => {
        body = await request.json()
        return ok({ ...store, isActive: false })
      }),
    )

    await updateStore('ch-ha-noi', { isActive: false })

    expect(body).toEqual({ isActive: false })
  })
})

describe('removeStore', () => {
  it('DELETE /stores/:slug — backend trả câu thông báo, không phải số', async () => {
    let called = false
    server.use(
      mswHttp.delete(`${BASE}/stores/ch-ha-noi`, () => {
        called = true
        return ok('1 store have been deleted successfully')
      }),
    )

    await expect(removeStore('ch-ha-noi')).resolves.toBe('1 store have been deleted successfully')
    expect(called).toBe(true)
  })
})

describe('assignStoreWarehouse', () => {
  it('PUT /stores/:slug/warehouse gửi đúng warehouseSlug, không kèm version', async () => {
    let body: unknown
    server.use(
      mswHttp.put(`${BASE}/stores/ch-ha-noi/warehouse`, async ({ request }) => {
        body = await request.json()
        return ok(store)
      }),
    )

    await assignStoreWarehouse('ch-ha-noi', { warehouseSlug: 'kho-ha-noi' })

    expect(body).toEqual({ warehouseSlug: 'kho-ha-noi' })
  })

  it('bỏ gán gửi warehouseSlug: null', async () => {
    let body: unknown
    server.use(
      mswHttp.put(`${BASE}/stores/ch-ha-noi/warehouse`, async ({ request }) => {
        body = await request.json()
        return ok(store)
      }),
    )

    await assignStoreWarehouse('ch-ha-noi', { warehouseSlug: null })

    expect(body).toEqual({ warehouseSlug: null })
  })
})

describe('fetchStore', () => {
  it('GET /stores/:slug trả đúng bản ghi', async () => {
    server.use(mswHttp.get(`${BASE}/stores/ch-ha-noi`, () => ok(store)))

    await expect(fetchStore('ch-ha-noi')).resolves.toEqual(store)
  })
})
