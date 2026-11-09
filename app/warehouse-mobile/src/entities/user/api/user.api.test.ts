import { ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'

import { fetchUserOptions, userSearchParams } from './user.api'

type Params = Record<string, unknown>

const page = (items: object[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 20, totalPages: 1, hasNext: false })

beforeEach(resetFakeApi)

describe('userSearchParams — như PersonFilter của web', () => {
  it('trống / chỉ khoảng trắng → không lọc', () => {
    expect(userSearchParams('')).toEqual({})
    expect(userSearchParams('   ')).toEqual({})
  })

  it('toàn chữ số (bỏ khoảng trắng) → phonenumber', () => {
    expect(userSearchParams('0901')).toEqual({ phonenumber: '0901' })
    expect(userSearchParams(' 0901 234 ')).toEqual({ phonenumber: '0901234' })
  })

  it('có chữ → name (trim, giữ nguyên chữ)', () => {
    expect(userSearchParams('  Nguyễn An ')).toEqual({ name: 'Nguyễn An' })
    expect(userSearchParams('an 09')).toEqual({ name: 'an 09' })
  })
})

describe('fetchUserOptions', () => {
  it('GET /users page=1 size=20 + khoá tìm; trả {slug, name, phonenumber} (họ trước tên)', async () => {
    let seen: Params = {}
    route('get', '/users', (c) => {
      seen = c.params as Params
      return page([
        {
          slug: 'u-1',
          phonenumber: '0901234567',
          firstName: 'Văn An',
          lastName: 'Nguyễn',
          isActive: true,
        },
        { slug: 'u-2', phonenumber: '0912000111', firstName: '', lastName: '' },
      ])
    })
    expect(await fetchUserOptions('09')).toEqual([
      { slug: 'u-1', name: 'Nguyễn Văn An', phonenumber: '0901234567' },
      { slug: 'u-2', name: '', phonenumber: '0912000111' },
    ])
    expect(seen).toEqual({ page: 1, size: 20, phonenumber: '09' })
  })

  it('tìm theo tên → name', async () => {
    let seen: Params = {}
    route('get', '/users', (c) => {
      seen = c.params as Params
      return page([])
    })
    await fetchUserOptions('bình')
    expect(seen).toEqual({ page: 1, size: 20, name: 'bình' })
  })
})
