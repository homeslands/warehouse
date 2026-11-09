// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { calls, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'

import { fetchAllWarehouses } from './warehouse.api'

/** Kho như `GET /warehouses` trả (`WarehouseResponseDto`, chỉ các trường app đọc + vài trường thừa). */
const apiWarehouse = (slug: string, over: object = {}) => ({
  slug,
  code: slug.toUpperCase(),
  name: `Kho ${slug}`,
  address: '',
  isActive: true,
  createdAt: '',
  updatedAt: '',
  ...over,
})

const page = (items: object[], p: number, hasNext: boolean) =>
  ok({ items, total: 0, page: p, pageSize: 100, totalPages: 0, hasNext, hasPrevios: p > 1 })

const params: Record<string, unknown>[] = []

beforeEach(() => {
  resetFakeApi()
  params.length = 0
})

describe('fetchAllWarehouses', () => {
  it('tải hết mọi trang (size 100), không gửi `isActive` → có cả kho đã tắt', async () => {
    route('get', '/warehouses', (config) => {
      params.push({ ...config.params })
      const p = Number(config.params.page)
      return p === 1
        ? page([apiWarehouse('b'), apiWarehouse('a', { isActive: false })], 1, true)
        : page([apiWarehouse('c')], 2, false)
    })
    const list = await fetchAllWarehouses('me')
    expect(calls).toHaveLength(2)
    expect(params).toEqual([
      { page: 1, size: 100 },
      { page: 2, size: 100 },
    ])
    expect(list.map((w) => w.slug)).toEqual(['a', 'b', 'c'])
    expect(list.find((w) => w.slug === 'a')).toEqual({
      slug: 'a',
      code: 'A',
      name: 'Kho a',
      isManager: false,
      isActive: false,
    })
  })

  it('đổi sang dạng kho của /auth/me: isManager = quản lý là chính mình; xếp theo tên', async () => {
    route('get', '/warehouses', () =>
      page(
        [
          apiWarehouse('z', { name: 'Kho Thủ Đức', manager: { slug: 'me', firstName: '' } }),
          apiWarehouse('y', { name: 'Kho An Phú', manager: { slug: 'other' } }),
          apiWarehouse('x', { name: 'kho Bình Dương' }),
        ],
        1,
        false,
      ),
    )
    const list = await fetchAllWarehouses('me')
    expect(list.map((w) => [w.name, w.isManager, w.isActive])).toEqual([
      ['Kho An Phú', false, true],
      ['kho Bình Dương', false, true],
      ['Kho Thủ Đức', true, true],
    ])
    // Không có userSlug → không kho nào là "Quản lý".
    expect((await fetchAllWarehouses(undefined)).some((w) => w.isManager)).toBe(false)
  })

  it('trùng slug giữa các trang (trang trôi khi có kho mới) → giữ bản đầu, không lặp', async () => {
    route('get', '/warehouses', (config) =>
      Number(config.params.page) === 1
        ? page([apiWarehouse('a'), apiWarehouse('b')], 1, true)
        : page([apiWarehouse('b', { name: 'Kho b (trang 2)' }), apiWarehouse('c')], 2, false),
    )
    const list = await fetchAllWarehouses('me')
    expect(list.map((w) => [w.slug, w.name])).toEqual([
      ['a', 'Kho a'],
      ['b', 'Kho b'],
      ['c', 'Kho c'],
    ])
  })

  it('một trang lỗi → cả lời gọi lỗi', async () => {
    route('get', '/warehouses', (config) =>
      Number(config.params.page) === 1 ? page([apiWarehouse('a')], 1, true) : failure(500),
    )
    await expect(fetchAllWarehouses('me')).rejects.toBeDefined()
  })
})
