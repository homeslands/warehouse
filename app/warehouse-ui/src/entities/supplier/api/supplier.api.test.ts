import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import {
  attachSupplierMaterial,
  createSupplier,
  createSupplierTransaction,
  detachSupplierMaterial,
  fetchSupplier,
  fetchSupplierMaterials,
  fetchSupplierTransactions,
  fetchSuppliers,
  removeSupplier,
  updateSupplier,
} from './supplier.api'
import type { Supplier, SupplierMaterial, SupplierTransaction } from '../model/types'

const BASE = 'http://localhost:8085/api/v1'

const supplier: Supplier = {
  slug: 's-1',
  createdAt: 'Thu Oct 08 2026 09:00:00 GMT+0700',
  updatedAt: 'Thu Oct 08 2026 09:00:00 GMT+0700',
  code: 'NCC-01',
  name: 'Công ty ABC',
  email: null,
}

describe('fetchSuppliers', () => {
  it('GET /suppliers gửi page/size', async () => {
    let query = ''
    server.use(
      mswHttp.get(`${BASE}/suppliers`, ({ request }) => {
        query = new URL(request.url).searchParams.toString()
        return paginated([supplier])
      }),
    )

    const result = await fetchSuppliers({ page: 1, size: 10 })

    expect(query).toBe(new URLSearchParams({ page: '1', size: '10' }).toString())
    expect(result.items).toEqual([supplier])
  })
})

describe('fetchSupplier', () => {
  it('GET /suppliers/:slug trả đúng bản ghi', async () => {
    server.use(mswHttp.get(`${BASE}/suppliers/s-1`, () => ok(supplier)))

    await expect(fetchSupplier('s-1')).resolves.toEqual(supplier)
  })
})

describe('createSupplier', () => {
  it('POST /suppliers với đúng body', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/suppliers`, async ({ request }) => {
        body = await request.json()
        return ok(supplier)
      }),
    )

    await createSupplier({ code: 'NCC-01', name: 'Công ty ABC', email: 'a@b.vn' })

    expect(body).toEqual({ code: 'NCC-01', name: 'Công ty ABC', email: 'a@b.vn' })
  })
})

describe('updateSupplier', () => {
  it('PATCH /suppliers/:slug chỉ gửi trường đổi', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${BASE}/suppliers/s-1`, async ({ request }) => {
        body = await request.json()
        return ok(supplier)
      }),
    )

    await updateSupplier('s-1', { name: 'Tên mới' })

    expect(body).toEqual({ name: 'Tên mới' })
  })
})

describe('removeSupplier', () => {
  it('DELETE /suppliers/:slug trả câu thông báo', async () => {
    let called = false
    server.use(
      mswHttp.delete(`${BASE}/suppliers/s-1`, () => {
        called = true
        return ok('1 supplier have been deleted successfully')
      }),
    )

    await expect(removeSupplier('s-1')).resolves.toBe('1 supplier have been deleted successfully')
    expect(called).toBe(true)
  })
})

const supplierMaterial: SupplierMaterial = {
  slug: 'm-1',
  createdAt: 'Thu Oct 08 2026 09:00:00 GMT+0700',
  updatedAt: 'Thu Oct 08 2026 09:00:00 GMT+0700',
  code: 'VT-01',
  name: 'Xi măng',
}

const transaction: SupplierTransaction = {
  slug: 't-1',
  createdAt: 'Thu Oct 08 2026 09:00:00 GMT+0700',
  updatedAt: 'Thu Oct 08 2026 09:00:00 GMT+0700',
  type: 'PAYMENT',
  amount: 500000,
  transactionDate: '2026-10-08T05:00:00.000Z',
}

describe('fetchSupplierMaterials', () => {
  it('GET /suppliers/:slug/materials gửi page/size', async () => {
    let query = ''
    server.use(
      mswHttp.get(`${BASE}/suppliers/s-1/materials`, ({ request }) => {
        query = new URL(request.url).searchParams.toString()
        return paginated([supplierMaterial])
      }),
    )

    const result = await fetchSupplierMaterials('s-1', { page: 1, size: 10 })

    expect(query).toBe(new URLSearchParams({ page: '1', size: '10' }).toString())
    expect(result.items).toEqual([supplierMaterial])
  })
})

describe('attachSupplierMaterial', () => {
  it('PUT /suppliers/:slug/materials/:materialSlug không body', async () => {
    let body = 'unset'
    server.use(
      mswHttp.put(`${BASE}/suppliers/s-1/materials/m-1`, async ({ request }) => {
        body = await request.text()
        return ok(supplierMaterial)
      }),
    )

    await expect(attachSupplierMaterial('s-1', 'm-1')).resolves.toEqual(supplierMaterial)
    expect(body).toBe('')
  })
})

describe('detachSupplierMaterial', () => {
  it('DELETE /suppliers/:slug/materials/:materialSlug', async () => {
    let called = false
    server.use(
      mswHttp.delete(`${BASE}/suppliers/s-1/materials/m-1`, () => {
        called = true
        return ok('detached')
      }),
    )

    await expect(detachSupplierMaterial('s-1', 'm-1')).resolves.toBe('detached')
    expect(called).toBe(true)
  })
})

describe('fetchSupplierTransactions', () => {
  it('GET /suppliers/:slug/transactions gửi bộ lọc type/from/to', async () => {
    let query: URLSearchParams | undefined
    server.use(
      mswHttp.get(`${BASE}/suppliers/s-1/transactions`, ({ request }) => {
        query = new URL(request.url).searchParams
        return paginated([transaction])
      }),
    )

    const result = await fetchSupplierTransactions('s-1', {
      page: 1,
      size: 10,
      type: 'PAYMENT',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-07T16:59:59.999Z',
    })

    expect(query?.get('type')).toBe('PAYMENT')
    expect(query?.get('from')).toBe('2026-10-01T00:00:00.000Z')
    expect(query?.get('to')).toBe('2026-10-07T16:59:59.999Z')
    expect(result.items).toEqual([transaction])
  })
})

describe('createSupplierTransaction', () => {
  it('POST /suppliers/:slug/transactions với body PAYMENT', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/suppliers/s-1/transactions`, async ({ request }) => {
        body = await request.json()
        return ok(transaction)
      }),
    )

    await createSupplierTransaction('s-1', { type: 'PAYMENT', amount: 500000 })

    expect(body).toEqual({ type: 'PAYMENT', amount: 500000 })
  })
})
