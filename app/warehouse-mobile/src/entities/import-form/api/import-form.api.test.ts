import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { installRnFormData } from '@/shared/api/testing/rn-form-data'
import {
  attachMaterialToSupplier,
  cancelImportForm,
  confirmImportForm,
  createImportForm,
  deleteImportForm,
  fetchAllAvailableMaterials,
  fetchAvailableMaterials,
  fetchImportForm,
  fetchImportFormCount,
  fetchImportFormSum,
  fetchConfirmedForms,
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

describe('fetchImportFormCount', () => {
  it('một call size=1 theo status, trả total', async () => {
    const seen: Params[] = []
    route('get', BASE, (c) => {
      seen.push(c.params as Params)
      return ok({ items: [], total: 7, page: 1, pageSize: 1, totalPages: 7, hasNext: true })
    })
    expect(await fetchImportFormCount('wh-1', 'DRAFT')).toBe(7)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ page: 1, size: 1, status: 'DRAFT' })
  })

  it('có day thì gửi startDate = endDate = day', async () => {
    const seen: Params[] = []
    route('get', BASE, (c) => {
      seen.push(c.params as Params)
      return ok({ items: [], total: 3, page: 1, pageSize: 1, totalPages: 3, hasNext: true })
    })
    expect(await fetchImportFormCount('wh-1', 'CONFIRMED', '2026-11-10')).toBe(3)
    expect(seen[0]).toMatchObject({
      page: 1,
      size: 1,
      status: 'CONFIRMED',
      startDate: '2026-11-10',
      endDate: '2026-11-10',
    })
  })

  it('không day thì không có startDate/endDate', async () => {
    const seen: Params[] = []
    route('get', BASE, (c) => {
      seen.push(c.params as Params)
      return ok({ items: [], total: 0, page: 1, pageSize: 1, totalPages: 0, hasNext: false })
    })
    await fetchImportFormCount('wh-1', 'DRAFT')
    expect(seen[0]).not.toHaveProperty('startDate')
    expect(seen[0]).not.toHaveProperty('endDate')
  })

  it('key đếm theo ngày khác nhau và nằm dưới tiền tố list', () => {
    const a = importFormKeys.count('a', 'CONFIRMED', '2026-11-10')
    expect(a).not.toEqual(importFormKeys.count('a', 'CONFIRMED', '2026-11-11'))
    expect(a).not.toEqual(importFormKeys.count('a', 'CONFIRMED'))
    expect(a.slice(0, 3)).toEqual([...importFormKeys.warehouse('a'), 'list'])
  })

  it('key đếm khác theo kho và nằm dưới tiền tố list', () => {
    expect(importFormKeys.count('a', 'DRAFT')).not.toEqual(importFormKeys.count('b', 'DRAFT'))
    expect(importFormKeys.count('a', 'DRAFT').slice(0, 3)).toEqual([
      ...importFormKeys.warehouse('a'),
      'list',
    ])
  })
})

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

describe('fetchAllAvailableMaterials', () => {
  const AV = `${BASE}/available-materials`

  it('đi hết các trang size=100, gộp và khử trùng theo slug', async () => {
    const seen: Params[] = []
    route('get', AV, (c) => {
      const p = c.params as Params
      seen.push(p)
      return p.page === 1 ? page([mat('a'), mat('b')], true) : page([mat('b'), mat('c')])
    })
    const res = await fetchAllAvailableMaterials('wh-1')
    expect(res.truncated).toBe(false)
    expect(res.items.map((m) => m.slug)).toEqual(['a', 'b', 'c'])
    expect(seen.map((p) => [p.page, p.size])).toEqual([
      [1, 100],
      [2, 100],
    ])
    expect(seen[0]).not.toHaveProperty('name')
  })

  it('chạm trần 50 trang → trả phần đã tải + truncated, không ném lỗi', async () => {
    let calls = 0
    route('get', AV, (c) => {
      calls++
      const p = (c.params as Params).page as number
      // Trang 2 lặp lại vật tư trang 1 → vẫn khử trùng.
      return page([mat(p === 2 ? 'p1' : `p${p}`)], true)
    })
    const res = await fetchAllAvailableMaterials('wh-1')
    expect(calls).toBe(50)
    expect(res.truncated).toBe(true)
    expect(res.items).toHaveLength(49)
    expect(res.items[0].slug).toBe('p1')
  })
})

describe('importFormKeys.availableAll', () => {
  it('nằm dưới tiền tố available để invalidateAfterMaterialWrite làm mới được', () => {
    expect(importFormKeys.availableAll('wh-1')[2]).toBe('available')
  })
  it('không trùng key tìm của từ khoá "all"', () => {
    expect(importFormKeys.availableAll('wh-1')).not.toEqual(importFormKeys.available('wh-1', 'all'))
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

describe('attachMaterialToSupplier', () => {
  it('PUT /suppliers/:slug/materials body { materialSlugs: [slug] }', async () => {
    let body: unknown
    route('put', '/suppliers/s1/materials', (c) => {
      body = JSON.parse(c.data as string)
      return ok({})
    })
    await attachMaterialToSupplier('s1', 'm1')
    expect(body).toEqual({ materialSlugs: ['m1'] })
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

describe('fetchImportFormSum', () => {
  const range = { startDate: '2026-11-01', endDate: '2026-11-11' }
  let n = 0
  const form = () => ({ slug: `f-${n++}`, total: 10 })

  beforeEach(() => {
    n = 0
  })

  it('đi hết các trang, cộng total, gửi status + khoảng ngày + size=100', async () => {
    const seen: Params[] = []
    route('get', BASE, (c) => {
      const p = c.params as Params
      seen.push(p)
      return p.page === 1
        ? page(Array.from({ length: 100 }, form), true)
        : page(Array.from({ length: 3 }, form))
    })
    expect(await fetchImportFormSum('wh-1', 'CONFIRMED', range)).toEqual({
      sum: 1030,
      count: 103,
      truncated: false,
    })
    expect(seen).toHaveLength(2)
    for (const p of seen) expect(p).toMatchObject({ status: 'CONFIRMED', ...range, size: 100 })
  })

  it('trang lặp cùng slug (dữ liệu đổi giữa chừng) → tính một lần', async () => {
    route('get', BASE, (c) => {
      const p = c.params as Params
      const dup = { slug: 'dup', total: 10 }
      return p.page === 1
        ? page([...Array.from({ length: 99 }, form), dup], true)
        : page([dup, form()])
    })
    expect(await fetchImportFormSum('wh-1', 'CONFIRMED', range)).toEqual({
      sum: 1010,
      count: 101,
      truncated: false,
    })
  })

  it('chạm trần trang → truncated: true, không ném lỗi', async () => {
    route('get', BASE, () => page([form()], true))
    const res = await fetchImportFormSum('wh-1', 'DRAFT')
    expect(res.truncated).toBe(true)
    expect(res.count).toBe(50)
  })
})

describe('importFormKeys.sum', () => {
  const r = { startDate: '2026-11-01', endDate: '2026-11-11' }
  it('khác theo kho, trạng thái, khoảng ngày; nằm dưới list của kho', () => {
    const a = importFormKeys.sum('a', 'CONFIRMED', r)
    expect(a).not.toEqual(importFormKeys.sum('b', 'CONFIRMED', r))
    expect(a).not.toEqual(importFormKeys.sum('a', 'DRAFT', r))
    expect(a).not.toEqual(importFormKeys.sum('a', 'CONFIRMED'))
    expect(a).not.toEqual(importFormKeys.sum('a', 'CONFIRMED', { ...r, endDate: '2026-11-10' }))
    expect(a).not.toEqual(importFormKeys.count('a', 'CONFIRMED'))
    expect(a.slice(0, 3)).toEqual([...importFormKeys.warehouse('a'), 'list'])
    expect(a[3]).toEqual({ status: 'CONFIRMED', ...r, sum: true })
  })
})

describe('fetchConfirmedForms', () => {
  const range = { startDate: '2026-11-01', endDate: '2026-11-12' }
  const raw = (slug: string) => ({
    slug,
    code: slug.toUpperCase(),
    createdAt: '2026-11-03T10:00:00.000Z',
    total: 10,
    requesterName: 'Nguyen A',
  })

  it('gửi status CONFIRMED + khoảng ngày mọi trang, bỏ trùng slug, rút gọn trường', async () => {
    const seen: Params[] = []
    route('get', BASE, (c) => {
      const p = c.params as Params
      seen.push(p)
      return p.page === 1 ? page([raw('a'), raw('b')], true) : page([raw('b'), raw('c')])
    })
    const r = await fetchConfirmedForms('wh-1', range)
    expect(seen).toHaveLength(2)
    for (const p of seen) expect(p).toMatchObject({ status: 'CONFIRMED', ...range })
    expect(r.truncated).toBe(false)
    expect(r.forms.map((f) => f.slug)).toEqual(['a', 'b', 'c'])
    expect(r.forms[0]).toEqual({
      slug: 'a',
      code: 'A',
      createdAt: '2026-11-03T10:00:00.000Z',
      amount: 10,
      party: 'Nguyen A',
      kind: 'import',
    })
  })

  it('party rỗng → null', async () => {
    route('get', BASE, () => page([{ ...raw('a'), requesterName: '' }]))
    expect((await fetchConfirmedForms('wh-1', range)).forms[0].party).toBeNull()
  })
})

describe('importFormKeys.period', () => {
  it('khác nhau theo kho và range, nằm dưới [warehouse, list]', () => {
    const r1 = { startDate: '2026-11-01', endDate: '2026-11-12' }
    const r2 = { startDate: '2026-10-01', endDate: '2026-10-31' }
    expect(importFormKeys.period('wh-1', r1)).not.toEqual(importFormKeys.period('wh-2', r1))
    expect(importFormKeys.period('wh-1', r1)).not.toEqual(importFormKeys.period('wh-1', r2))
    expect(importFormKeys.period('wh-1', r1).slice(0, 3)).toEqual([
      ...importFormKeys.warehouse('wh-1'),
      'list',
    ])
  })
})
