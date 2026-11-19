import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { installRnFormData } from '@/shared/api/testing/rn-form-data'
import {
  cancelExportForm,
  confirmExportForm,
  createExportForm,
  deleteExportForm,
  fetchExportForm,
  fetchExportFormCount,
  fetchExportFormSum,
  fetchConfirmedForms,
  fetchExportForms,
  submitExportForm,
  updateExportForm,
  uploadExportFormFile,
} from './export-form.api'
import { exportFormKeys } from './query-keys'

type Params = Record<string, unknown>

const page = (items: object[], hasNext = false) =>
  ok({ items, total: items.length, page: 1, pageSize: 20, totalPages: 1, hasNext })

const BASE = '/warehouses/wh-1/export-forms'

const input = {
  code: 'PX-01',
  type: 'SALE' as const,
  purchaseOrder: 'PO-1',
  receiver: 'Cty A',
  items: [{ materialSlug: 'm1', unitSlug: 'u1', quantity: 2.5, unitPrice: 1000, batchSlug: 'b1' }],
}

beforeEach(resetFakeApi)

describe('fetchExportFormCount', () => {
  it('một call size=1 theo status, trả total', async () => {
    const seen: Params[] = []
    route('get', BASE, (c) => {
      seen.push(c.params as Params)
      return ok({ items: [], total: 4, page: 1, pageSize: 1, totalPages: 4, hasNext: true })
    })
    expect(await fetchExportFormCount('wh-1', 'PENDING')).toBe(4)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ page: 1, size: 1, status: 'PENDING' })
  })

  it('có day thì gửi startDate = endDate = day', async () => {
    const seen: Params[] = []
    route('get', BASE, (c) => {
      seen.push(c.params as Params)
      return ok({ items: [], total: 3, page: 1, pageSize: 1, totalPages: 3, hasNext: true })
    })
    expect(await fetchExportFormCount('wh-1', 'CONFIRMED', '2026-11-10')).toBe(3)
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
    await fetchExportFormCount('wh-1', 'PENDING')
    expect(seen[0]).not.toHaveProperty('startDate')
    expect(seen[0]).not.toHaveProperty('endDate')
  })

  it('key đếm theo ngày khác nhau và nằm dưới tiền tố list', () => {
    const a = exportFormKeys.count('a', 'CONFIRMED', '2026-11-10')
    expect(a).not.toEqual(exportFormKeys.count('a', 'CONFIRMED', '2026-11-11'))
    expect(a).not.toEqual(exportFormKeys.count('a', 'CONFIRMED'))
    expect(a.slice(0, 3)).toEqual([...exportFormKeys.warehouse('a'), 'list'])
  })

  it('key đếm khác theo kho và nằm dưới tiền tố list', () => {
    expect(exportFormKeys.count('a', 'PENDING')).not.toEqual(exportFormKeys.count('b', 'PENDING'))
    expect(exportFormKeys.count('a', 'PENDING').slice(0, 3)).toEqual([
      ...exportFormKeys.warehouse('a'),
      'list',
    ])
  })
})

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

describe('fetchExportFormSum', () => {
  const range = { startDate: '2026-11-01', endDate: '2026-11-11' }
  let n = 0
  const form = () => ({ slug: `f-${n++}`, totalAmount: 10 })
  const pg = (items: object[], hasNext: boolean) =>
    ok({ items, total: items.length, page: 1, pageSize: 100, totalPages: 1, hasNext })

  beforeEach(() => {
    n = 0
  })

  it('đi hết các trang, cộng totalAmount, gửi status + khoảng ngày + size=100', async () => {
    const seen: Params[] = []
    route('get', BASE, (c) => {
      const p = c.params as Params
      seen.push(p)
      return p.page === 1
        ? pg(Array.from({ length: 100 }, form), true)
        : pg(Array.from({ length: 3 }, form), false)
    })
    expect(await fetchExportFormSum('wh-1', 'CONFIRMED', range)).toEqual({
      sum: 1030,
      count: 103,
      truncated: false,
    })
    for (const p of seen) expect(p).toMatchObject({ status: 'CONFIRMED', ...range, size: 100 })
  })

  it('trang lặp cùng slug (dữ liệu đổi giữa chừng) → tính một lần', async () => {
    route('get', BASE, (c) => {
      const p = c.params as Params
      const dup = { slug: 'dup', totalAmount: 10 }
      return p.page === 1
        ? pg([...Array.from({ length: 99 }, form), dup], true)
        : pg([dup, form()], false)
    })
    expect(await fetchExportFormSum('wh-1', 'CONFIRMED', range)).toEqual({
      sum: 1010,
      count: 101,
      truncated: false,
    })
  })

  it('chạm trần trang → truncated: true', async () => {
    route('get', BASE, () => pg([form()], true))
    expect((await fetchExportFormSum('wh-1', 'PENDING')).truncated).toBe(true)
  })
})

describe('exportFormKeys.sum', () => {
  const r = { startDate: '2026-11-01', endDate: '2026-11-11' }
  it('khác theo kho, trạng thái, khoảng ngày; nằm dưới list của kho', () => {
    const a = exportFormKeys.sum('a', 'CONFIRMED', r)
    expect(a).not.toEqual(exportFormKeys.sum('b', 'CONFIRMED', r))
    expect(a).not.toEqual(exportFormKeys.sum('a', 'DRAFT', r))
    expect(a).not.toEqual(exportFormKeys.sum('a', 'CONFIRMED'))
    expect(a).not.toEqual(exportFormKeys.sum('a', 'CONFIRMED', { ...r, endDate: '2026-11-10' }))
    expect(a).not.toEqual(exportFormKeys.count('a', 'CONFIRMED'))
    expect(a.slice(0, 3)).toEqual([...exportFormKeys.warehouse('a'), 'list'])
    expect(a[3]).toEqual({ status: 'CONFIRMED', ...r, sum: true })
  })
})

describe('fetchConfirmedForms', () => {
  const range = { startDate: '2026-11-01', endDate: '2026-11-12' }
  const raw = (slug: string) => ({
    slug,
    code: slug.toUpperCase(),
    createdAt: '2026-11-03T10:00:00.000Z',
    totalAmount: 10,
    receiver: 'Cong ty B',
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
      party: 'Cong ty B',
      kind: 'export',
    })
  })

  it('party rỗng → null', async () => {
    route('get', BASE, () => page([{ ...raw('a'), receiver: '' }]))
    expect((await fetchConfirmedForms('wh-1', range)).forms[0].party).toBeNull()
  })
})

describe('exportFormKeys.period', () => {
  it('khác nhau theo kho và range, nằm dưới [warehouse, list]', () => {
    const r1 = { startDate: '2026-11-01', endDate: '2026-11-12' }
    const r2 = { startDate: '2026-10-01', endDate: '2026-10-31' }
    expect(exportFormKeys.period('wh-1', r1)).not.toEqual(exportFormKeys.period('wh-2', r1))
    expect(exportFormKeys.period('wh-1', r1)).not.toEqual(exportFormKeys.period('wh-1', r2))
    expect(exportFormKeys.period('wh-1', r1).slice(0, 3)).toEqual([
      ...exportFormKeys.warehouse('wh-1'),
      'list',
    ])
  })
})
