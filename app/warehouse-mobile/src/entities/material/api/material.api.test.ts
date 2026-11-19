import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import {
  fetchMaterialByCode,
  fetchMaterialsPage,
  removeConversionUnit,
  updateMaterial,
} from './material.api'

beforeEach(resetFakeApi)

const page = (slugs: string[], hasNext = false) =>
  ok({
    items: slugs.map((slug) => ({ slug, code: slug.toUpperCase(), name: slug })),
    total: slugs.length,
    page: 1,
    pageSize: 30,
    totalPages: 1,
    hasNext,
    hasPrevios: false,
  })

describe('fetchMaterialsPage', () => {
  it('query rỗng + typeSlug: một GET không name/code', async () => {
    const seen: unknown[] = []
    route('get', '/materials', (c) => {
      seen.push(c.params)
      return page(['a'])
    })
    await fetchMaterialsPage({ query: '', typeSlug: 't1', page: 1 })
    expect(seen).toEqual([{ page: 1, size: 30, sortBy: 'code', sort: 'ASC', typeSlug: 't1' }])
  })
  it('query "kg": 2 GET (name, code), khử trùng slug', async () => {
    const seen: Record<string, unknown>[] = []
    route('get', '/materials', (c) => {
      seen.push(c.params as Record<string, unknown>)
      return page(['m1', 'm2'])
    })
    const res = await fetchMaterialsPage({ query: 'kg', page: 1 })
    expect(seen).toHaveLength(2)
    expect(seen.find((p) => p.name === 'kg')).toBeDefined()
    expect(seen.find((p) => p.code === 'KG')).toBeDefined()
    expect(res.items.map((m) => m.slug)).toEqual(['m1', 'm2'])
  })
  it('query "#": không gọi mạng', async () => {
    const res = await fetchMaterialsPage({ query: '#', page: 1 })
    expect(callsTo('get', '/materials')).toHaveLength(0)
    expect(res.items).toEqual([])
    expect(res.hasNext).toBe(false)
  })
})

describe('material api ghi', () => {
  it('updateMaterial gửi PATCH đúng body', async () => {
    let body: unknown
    route('patch', '/materials/m1', (c) => {
      body = JSON.parse(c.data as string)
      return ok({ slug: 'm1' })
    })
    await updateMaterial('m1', { name: 'X' })
    expect(body).toEqual({ name: 'X' })
  })
  it('removeConversionUnit gọi DELETE', async () => {
    route('delete', '/materials/m1/conversion-units/thung', () => ok(null))
    await removeConversionUnit('m1', 'thung')
    expect(callsTo('delete', '/materials/m1/conversion-units/thung')).toHaveLength(1)
  })
})

describe('fetchMaterialByCode', () => {
  it('lọc code là tiền tố: xin sắp xếp theo mã tăng dần để mã chính xác lên trước, và tìm thấy nó', async () => {
    const seen: Record<string, unknown>[] = []
    route('get', '/materials', (c) => {
      seen.push(c.params as Record<string, unknown>)
      return page(['vt1', 'vt10', 'vt11'])
    })
    const m = await fetchMaterialByCode('VT1')
    expect(seen[0]).toMatchObject({ sortBy: 'code', sort: 'ASC' })
    expect(m?.slug).toBe('vt1')
  })
  it('GET code viết hoa, trả phần tử khớp CHÍNH XÁC (bỏ mã chỉ trùng một phần)', async () => {
    const seen: Record<string, unknown>[] = []
    route('get', '/materials', (c) => {
      seen.push(c.params as Record<string, unknown>)
      return page(['vt10', 'vt1'])
    })
    const m = await fetchMaterialByCode(' vt1 ')
    expect(seen).toEqual([{ code: 'VT1', page: 1, size: 5, sortBy: 'code', sort: 'ASC' }])
    expect(m?.slug).toBe('vt1')
  })
  it('không có mã khớp → null', async () => {
    route('get', '/materials', () => page(['vt10']))
    expect(await fetchMaterialByCode('VT1')).toBeNull()
  })
  it('lỗi → ném', async () => {
    route('get', '/materials', () => failure(500))
    await expect(fetchMaterialByCode('VT1')).rejects.toBeDefined()
  })
})
