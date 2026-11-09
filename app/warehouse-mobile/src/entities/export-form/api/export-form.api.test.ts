import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { installRnFormData } from '@/shared/api/testing/rn-form-data'
import {
  cancelExportForm,
  confirmExportForm,
  createExportForm,
  deleteExportForm,
  fetchExportForm,
  fetchExportForms,
  submitExportForm,
  updateExportForm,
  uploadExportFormFile,
} from './export-form.api'
import { exportFormKeys } from './query-keys'

type Params = Record<string, unknown>

const page = (items: object[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 20, totalPages: 1, hasNext: false })

const BASE = '/warehouses/wh-1/export-forms'

const input = {
  code: 'PX-01',
  type: 'SALE' as const,
  purchaseOrder: 'PO-1',
  receiver: 'Cty A',
  items: [{ materialSlug: 'm1', unitSlug: 'u1', quantity: 2.5, unitPrice: 1000, batchSlug: 'b1' }],
}

beforeEach(resetFakeApi)

describe('fetchExportForms', () => {
  it('gửi page, size=20, sort=DESC, status, type và code viết hoa', async () => {
    let seen: Params = {}
    route('get', BASE, (c) => {
      seen = c.params as Params
      return page([])
    })
    await fetchExportForms('wh-1', {
      page: 2,
      status: 'PENDING',
      type: 'DISPOSAL',
      field: 'code',
      query: 'px-01',
    })
    expect(seen).toMatchObject({
      page: 2,
      size: 20,
      sort: 'DESC',
      status: 'PENDING',
      type: 'DISPOSAL',
      code: 'PX-01',
    })
    expect(seen).not.toHaveProperty('invoiceCode')
  })

  it('invoiceCode / purchaseOrder giữ nguyên chữ', async () => {
    const seen: Params[] = []
    route('get', BASE, (c) => {
      seen.push(c.params as Params)
      return page([])
    })
    await fetchExportForms('wh-1', { page: 1, field: 'invoiceCode', query: 'Ab1' })
    await fetchExportForms('wh-1', { page: 1, field: 'purchaseOrder', query: 'po-9' })
    expect(seen[0].invoiceCode).toBe('Ab1')
    expect(seen[1].purchaseOrder).toBe('po-9')
    expect(seen[0]).not.toHaveProperty('type')
  })

  it('ngày + người gửi nguyên giá trị', async () => {
    let seen: Params = {}
    route('get', BASE, (c) => {
      seen = c.params as Params
      return page([])
    })
    await fetchExportForms('wh-1', {
      page: 1,
      startDate: '2026-10-30',
      endDate: '2026-11-05',
      requesterSlug: 'u-1',
      approverSlug: 'u-2',
    })
    expect(seen).toMatchObject({
      startDate: '2026-10-30',
      endDate: '2026-11-05',
      requesterSlug: 'u-1',
      approverSlug: 'u-2',
    })
  })

  it('mã có ký tự lạ → trang rỗng, không gọi API', async () => {
    route('get', BASE, () => page([]))
    const res = await fetchExportForms('wh-1', { page: 1, field: 'code', query: 'phiếu 26' })
    expect(res).toMatchObject({ items: [], total: 0, page: 1, hasNext: false })
    expect(callsTo('get', BASE)).toHaveLength(0)
  })

  it('không lọc → không có khoá lọc nào', async () => {
    let seen: Params = {}
    route('get', BASE, (c) => {
      seen = c.params as Params
      return page([])
    })
    await fetchExportForms('wh-1', { page: 1, field: 'code', query: '  ' })
    for (const k of ['status', 'type', 'code', 'startDate', 'requesterSlug', 'approverSlug'])
      expect(seen).not.toHaveProperty(k)
  })
})

describe('thao tác một phiếu', () => {
  it('fetchExportForm: GET /{slug}', async () => {
    route('get', `${BASE}/f-1`, () => ok({ slug: 'f-1' }))
    expect(await fetchExportForm('wh-1', 'f-1')).toEqual({ slug: 'f-1' })
  })

  it('createExportForm: POST body nguyên input', async () => {
    let body: unknown
    route('post', BASE, (c) => {
      body = JSON.parse(c.data as string)
      return ok({ slug: 'f-1' })
    })
    await createExportForm('wh-1', input)
    expect(body).toEqual(input)
  })

  it('updateExportForm: PATCH body input + version', async () => {
    let body: unknown
    route('patch', `${BASE}/f-1`, (c) => {
      body = JSON.parse(c.data as string)
      return ok({ slug: 'f-1' })
    })
    await updateExportForm('wh-1', 'f-1', { ...input, version: 3 })
    expect(body).toEqual({ ...input, version: 3 })
  })

  it.each([
    ['submit', submitExportForm],
    ['confirm', confirmExportForm],
    ['cancel', cancelExportForm],
  ] as const)('%s: POST /{slug}/%s body { version }', async (action, fn) => {
    const url = `${BASE}/f-1/${action}`
    let body: unknown
    route('post', url, (c) => {
      body = JSON.parse(c.data as string)
      return ok({ slug: 'f-1' })
    })
    await fn('wh-1', 'f-1', 4)
    expect(body).toEqual({ version: 4 })
  })

  it('deleteExportForm: DELETE /{slug} không body', async () => {
    let data: unknown = 'unset'
    route('delete', `${BASE}/f-1`, (c) => {
      data = c.data
      return ok('1 export form have been deleted successfully')
    })
    await deleteExportForm('wh-1', 'f-1')
    expect(callsTo('delete', `${BASE}/f-1`)).toHaveLength(1)
    expect(data).toBeUndefined()
  })
})

describe('exportFormKeys', () => {
  it('mọi key bắt đầu [export-forms, wh]; bộ lọc khác → key khác', () => {
    const keys = [
      exportFormKeys.list('wh-1', { status: 'DRAFT' }),
      exportFormKeys.detail('wh-1', 'f-1'),
    ]
    for (const k of keys) expect(k.slice(0, 2)).toEqual(['export-forms', 'wh-1'])
    expect(exportFormKeys.list('wh-1', { type: 'SALE' })).not.toEqual(
      exportFormKeys.list('wh-1', { type: 'OTHER' }),
    )
  })
})

describe('uploadExportFormFile', () => {
  let restoreFormData: () => void
  beforeAll(() => {
    restoreFormData = installRnFormData()
  })
  afterAll(() => restoreFormData())

  it('POST multipart tới upload-file với trường file, trả URL', async () => {
    let body: unknown
    let ctype: unknown
    route('post', '/warehouses/wh1/export-forms/upload-file', (c) => {
      body = c.data
      ctype = c.headers.get('Content-Type')
      return ok('https://b.s3.amazonaws.com/export-forms/a-1731000000000.jpg')
    })
    const url = await uploadExportFormFile('wh1', {
      uri: 'file:///a.jpg',
      name: 'a.jpg',
      mimeType: 'image/jpeg',
    })
    expect(url).toBe('https://b.s3.amazonaws.com/export-forms/a-1731000000000.jpg')
    expect(body).toBeInstanceOf(FormData)
    const parts = (body as { _parts: [string, unknown][] })._parts
    expect(parts).toEqual([['file', { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' }]])
    expect(String(ctype)).toContain('multipart/form-data')
  })
})
