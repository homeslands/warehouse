import { ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { TOO_MANY_PAGES_ERROR, fetchAllPages, fetchPagesUpToCap } from './fetch-all-pages'

type Params = Record<string, unknown>
const seen: Params[] = []

const pageOf = (page: number, hasNext: boolean) =>
  ok({
    items: [{ id: page }],
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

describe('fetchAllPages', () => {
  it('gộp các trang, gửi page và size=100', async () => {
    route('get', '/things', (config) => {
      seen.push(config.params as Params)
      const page = (config.params as Params).page as number
      return pageOf(page, page < 2)
    })
    const all = await fetchAllPages<{ id: number }>('/things', { sort: 'DESC' })
    expect(all).toEqual([{ id: 1 }, { id: 2 }])
    expect(seen.map((p) => p.page)).toEqual([1, 2])
    expect(seen.every((p) => p.size === 100 && p.sort === 'DESC')).toBe(true)
  })

  it('luôn hasNext thì báo too-many-pages', async () => {
    route('get', '/things', (config) => pageOf((config.params as Params).page as number, true))
    await expect(fetchAllPages('/things')).rejects.toThrow(TOO_MANY_PAGES_ERROR)
  })
})

describe('fetchPagesUpToCap — huỷ', () => {
  it('signal bị huỷ giữa chừng → không gọi thêm trang nào', async () => {
    const controller = new AbortController()
    route('get', '/things', (config) => {
      seen.push(config.params as Params)
      controller.abort()
      return pageOf((config.params as Params).page as number, true)
    })
    await expect(fetchPagesUpToCap('/things', {}, controller.signal)).rejects.toBeDefined()
    expect(seen.map((p) => p.page)).toEqual([1])
  })

  it('không truyền signal vẫn đi hết các trang', async () => {
    route('get', '/things', (config) => {
      const page = (config.params as Params).page as number
      return pageOf(page, page < 2)
    })
    const res = await fetchPagesUpToCap<{ id: number }>('/things')
    expect(res).toEqual({ items: [{ id: 1 }, { id: 2 }], truncated: false })
  })
})
