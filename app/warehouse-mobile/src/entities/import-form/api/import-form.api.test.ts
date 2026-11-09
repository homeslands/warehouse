import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { installRnFormData } from '@/shared/api/testing/rn-form-data'
import {
  cancelImportForm,
  confirmImportForm,
  createImportForm,
  deleteImportForm,
  fetchAvailableMaterials,
  fetchImportForm,
  fetchImportForms,
  fetchSuppliers,
  updateImportForm,
  uploadImportFormFile,
} from './import-form.api'
import { importFormKeys } from './query-keys'

type Params = Record<string, unknown>

const page = (items: object[], hasNext = false) =>
  ok({
    items,
    total: items.length,
    page: 1,
    pageSize: 20,
    totalPages: 1,
    hasNext,
    hasPrevios: false,
  })

const mat = (slug: string) => ({
  slug,
  code: slug.toUpperCase(),
  name: slug,
  baseUnitSlug: null,
  quantity: 0,
  suppliers: [],
  units: [],
})

const BASE = '/warehouses/wh-1/import-forms'

beforeEach(resetFakeApi)

describe('fetchImportForms', () => {
  it('gửi page, size=20, sort=DESC, status và code viết hoa', async () => {
    let seen: Params = {}
    route('get', BASE, (c) => {
      seen = c.params as Params
      return page([])
    })
    await fetchImportForms('wh-1', { page: 2, status: 'DRAFT', field: 'code', query: 'pn-01' })
    expect(seen).toMatchObject({ page: 2, size: 20, sort: 'DESC', status: 'DRAFT', code: 'PN-01' })
    expect(seen).not.toHaveProperty('invoiceCode')
  })

  it('field invoiceCode / purchaseOrder giữ nguyên chữ', async () => {
    const seen: Params[] = []
    route('get', BASE, (c) => {
      seen.push(c.params as Params)
      return page([])
    })
    await fetchImportForms('wh-1', { page: 1, field: 'invoiceCode', query: 'Ab1' })
    await fetchImportForms('wh-1', { page: 1, field: 'purchaseOrder', query: 'po-9' })
    expect(seen[0].invoiceCode).toBe('Ab1')
    expect(seen[1].purchaseOrder).toBe('po-9')
    expect(seen[0]).not.toHaveProperty('status')
  })

  it('mã có dấu cách / chữ Việt → trang rỗng, không gọi API', async () => {
    route('get', BASE, () => page([]))
    const res = await fetchImportForms('wh-1', { page: 1, field: 'code', query: 'pn 26' })
    const res2 = await fetchImportForms('wh-1', { page: 1, field: 'code', query: 'phiếu' })
    expect(res).toMatchObject({ items: [], total: 0, page: 1, hasNext: false })
    expect(res2.items).toEqual([])
    expect(callsTo('get', BASE)).toHaveLength(0)
  })

  it('trim: "  pn-26 " → code=PN-26; invoiceCode "  hd01 " → hd01; chỉ khoảng trắng → không lọc', async () => {
    const seen: Params[] = []
    route('get', BASE, (c) => {
      seen.push(c.params as Params)
      return page([])
    })
    await fetchImportForms('wh-1', { page: 1, field: 'code', query: '  pn-26 ' })
    await fetchImportForms('wh-1', { page: 1, field: 'invoiceCode', query: '  hd01 ' })
    await fetchImportForms('wh-1', { page: 1, field: 'code', query: '   ' })
    expect(seen[0].code).toBe('PN-26')
    expect(seen[1].invoiceCode).toBe('hd01')
    expect(seen[2]).not.toHaveProperty('code')
  })

  it('không có query → không gửi khoá tìm', async () => {
    let seen: Params = {}
    route('get', BASE, (c) => {
      seen = c.params as Params
      return page([])
    })
    await fetchImportForms('wh-1', { page: 1, field: 'code' })
    expect(seen).not.toHaveProperty('code')
  })
})

describe('fetchImportForms — bộ lọc thời gian / người (GetAllImportFormRequestDto)', () => {
  it('startDate, endDate, requesterSlug, approverSlug gửi nguyên giá trị, cùng status + tìm kiếm', async () => {
    let seen: Params = {}
    route('get', BASE, (c) => {
      seen = c.params as Params
      return page([])
    })
    await fetchImportForms('wh-1', {
      page: 1,
      status: 'CONFIRMED',
      field: 'code',
      query: 'pn',
      startDate: '2026-10-30',
      endDate: '2026-11-05',
      requesterSlug: 'u-1',
      approverSlug: 'u-2',
    })
    expect(seen).toMatchObject({
      status: 'CONFIRMED',
      code: 'PN',
      startDate: '2026-10-30',
      endDate: '2026-11-05',
      requesterSlug: 'u-1',
      approverSlug: 'u-2',
    })
  })

  it('không lọc → không có khoá nào trong bốn khoá mới', async () => {
    let seen: Params = {}
    route('get', BASE, (c) => {
      seen = c.params as Params
      return page([])
    })
    await fetchImportForms('wh-1', { page: 1 })
    for (const key of ['startDate', 'endDate', 'requesterSlug', 'approverSlug'])
      expect(seen).not.toHaveProperty(key)
  })

  it('query key mang bộ lọc: khác thời gian / người → khác key', () => {
    const a = importFormKeys.list('wh-1', { status: 'DRAFT', startDate: '2026-11-05' })
    const b = importFormKeys.list('wh-1', { status: 'DRAFT', startDate: '2026-11-04' })
    const c = importFormKeys.list('wh-1', { status: 'DRAFT', requesterSlug: 'u-1' })
    expect(a).toEqual([
      'import-forms',
      'wh-1',
      'list',
      { status: 'DRAFT', startDate: '2026-11-05' },
    ])
    expect(a).not.toEqual(b)
    expect(c[3]).toEqual({ status: 'DRAFT', requesterSlug: 'u-1' })
  })
})

describe('fetchImportForm', () => {
  it('GET theo slug', async () => {
    route('get', `${BASE}/f-1`, () => ok({ slug: 'f-1' }))
    expect(await fetchImportForm('wh-1', 'f-1')).toEqual({ slug: 'f-1' })
  })
})

describe('fetchAvailableMaterials', () => {
  const AV = `${BASE}/available-materials`

  it('query chữ có dấu cách → chỉ gọi name', async () => {
    const seen: Params[] = []
    route('get', AV, (c) => {
      seen.push(c.params as Params)
      return page([mat('a')])
    })
    await fetchAvailableMaterials('wh-1', { query: 'bột mì', page: 1 })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ name: 'bột mì', size: 50, page: 1 })
    expect(seen[0]).not.toHaveProperty('code')
  })

  it('query dạng mã → gọi name + code, gộp không trùng slug', async () => {
    route('get', AV, (c) => {
      const p = c.params as Params
      return p.code ? page([mat('b'), mat('c')]) : page([mat('a'), mat('b')])
    })
    const res = await fetchAvailableMaterials('wh-1', { query: 'NL-01', page: 1 })
    expect(callsTo('get', AV)).toHaveLength(2)
    expect(res.items.map((m) => m.slug)).toEqual(['a', 'b', 'c'])
  })

  it('hasNext nếu một trong hai lời gọi còn trang', async () => {
    route('get', AV, (c) => page([mat('a')], !!(c.params as Params).code))
    const res = await fetchAvailableMaterials('wh-1', { query: 'x1', page: 1 })
    expect(res.hasNext).toBe(true)
  })
})

describe('ghi', () => {
  it('PATCH gửi items[].expiryDate nguyên giá trị, cả null', async () => {
    let body: any
    route('patch', `${BASE}/f-1`, (c) => {
      body = JSON.parse(c.data as string)
      return ok({ slug: 'f-1' })
    })
    await updateImportForm('wh-1', 'f-1', {
      code: 'PN-1',
      invoiceCode: 'HD1',
      date: '2026-11-04',
      version: 3,
      items: [
        { materialSlug: 'm1', unitSlug: 'u1', quantity: 1, unitPrice: 0, expiryDate: '2026-12-01' },
        { materialSlug: 'm2', unitSlug: 'u1', quantity: 2, unitPrice: 5, expiryDate: null },
      ],
    })
    expect(body.version).toBe(3)
    expect(body.items[0].expiryDate).toBe('2026-12-01')
    expect(body.items[1]).toHaveProperty('expiryDate', null)
  })

  it('POST tạo gửi body', async () => {
    let body: any
    route('post', BASE, (c) => {
      body = JSON.parse(c.data as string)
      return ok({ slug: 'new' })
    })
    await createImportForm('wh-1', {
      code: 'PN-1',
      invoiceCode: 'HD1',
      date: '2026-11-04',
      items: [{ materialSlug: 'm1', unitSlug: 'u1', quantity: 1, unitPrice: 0 }],
    })
    expect(body.code).toBe('PN-1')
  })

  it('confirm gửi {version}', async () => {
    let body: unknown
    route('post', `${BASE}/f-1/confirm`, (c) => {
      body = JSON.parse(c.data as string)
      return ok({ slug: 'f-1' })
    })
    await confirmImportForm('wh-1', 'f-1', 7)
    expect(body).toEqual({ version: 7 })
  })
})

describe('fetchSuppliers', () => {
  it('GET /suppliers?page=1&size=100 → {slug, code, name}', async () => {
    let seen: Params = {}
    route('get', '/suppliers', (c) => {
      seen = c.params as Params
      return page([{ slug: 's1', code: 'S1', name: 'NCC 1', taxCode: 'x', address: 'y' }])
    })
    expect(await fetchSuppliers()).toEqual([{ slug: 's1', code: 'S1', name: 'NCC 1' }])
    expect(seen).toMatchObject({ page: 1, size: 100 })
  })
})

describe('cancelImportForm / deleteImportForm', () => {
  it('cancelImportForm: POST /{slug}/cancel body { version }, trả phiếu', async () => {
    let body: unknown
    route('post', `${BASE}/pn-1/cancel`, (c) => {
      body = JSON.parse(c.data as string)
      return ok({ slug: 'pn-1', status: 'CANCELLED' })
    })
    const res = await cancelImportForm('wh-1', 'pn-1', 3)
    expect(body).toEqual({ version: 3 })
    expect(res).toMatchObject({ slug: 'pn-1', status: 'CANCELLED' })
  })

  it('deleteImportForm: DELETE /{slug} không body', async () => {
    let data: unknown = 'unset'
    route('delete', `${BASE}/pn-1`, (c) => {
      data = c.data
      return ok('1 import form have been deleted successfully')
    })
    await deleteImportForm('wh-1', 'pn-1')
    expect(callsTo('delete', `${BASE}/pn-1`)).toHaveLength(1)
    expect(data).toBeUndefined()
  })
})

describe('uploadImportFormFile', () => {
  let restoreFormData: () => void
  beforeAll(() => {
    restoreFormData = installRnFormData()
  })
  afterAll(() => restoreFormData())

  it('POST multipart tới upload-file với trường file, trả URL', async () => {
    let body: unknown
    let ctype: unknown
    route('post', '/warehouses/wh1/import-forms/upload-file', (c) => {
      body = c.data
      ctype = c.headers.get('Content-Type')
      return ok('https://b.s3.amazonaws.com/import-forms/a-1731000000000.jpg')
    })
    const url = await uploadImportFormFile('wh1', {
      uri: 'file:///a.jpg',
      name: 'a.jpg',
      mimeType: 'image/jpeg',
    })
    expect(url).toBe('https://b.s3.amazonaws.com/import-forms/a-1731000000000.jpg')
    expect(body).toBeInstanceOf(FormData)
    const parts = (body as { _parts: [string, unknown][] })._parts
    expect(parts).toEqual([['file', { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' }]])
    expect(String(ctype)).toContain('multipart/form-data')
  })
})
