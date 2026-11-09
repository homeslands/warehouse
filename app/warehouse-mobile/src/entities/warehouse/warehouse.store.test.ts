// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { kv } from '@/shared/storage/kv'
import { useWarehouseStore } from './warehouse.store'

const w = (slug: string) => ({
  slug,
  code: slug.toUpperCase(),
  name: `Kho ${slug}`,
  isManager: false,
})
const user = (slug: string, warehouses = [w('x'), w('y')]) => ({
  userSlug: slug,
  userName: `name-${slug}`,
  warehouses,
})

beforeEach(async () => {
  resetFakeApi()
  useWarehouseStore.getState().reset()
  await AsyncStorage.clear()
})

describe('warehouse store', () => {
  it('select ghi kv theo khoá của user', async () => {
    await useWarehouseStore.getState().resolveFor(user('a'))
    await useWarehouseStore.getState().select(w('x'))
    expect(await kv.get('warehouse.lastWarehouse.a')).toBe('x')
    expect(useWarehouseStore.getState().current).toEqual(w('x'))
  })

  it('user B không tự chọn kho của user A', async () => {
    await useWarehouseStore.getState().resolveFor(user('a'))
    await useWarehouseStore.getState().select(w('x'))
    useWarehouseStore.getState().reset()
    await useWarehouseStore.getState().resolveFor(user('b'))
    const s = useWarehouseStore.getState()
    expect(s.current).toBeNull()
    expect(s.resolution).toBe('choose')
    expect(s.resolved).toBe(true)
  })

  it('cùng user quay lại thì chọn lại kho cũ', async () => {
    await useWarehouseStore.getState().resolveFor(user('a'))
    await useWarehouseStore.getState().select(w('y'))
    useWarehouseStore.getState().reset()
    await useWarehouseStore.getState().resolveFor(user('a'))
    expect(useWarehouseStore.getState().current).toEqual(w('y'))
    expect(useWarehouseStore.getState().resolution).toBe('selected')
  })

  it('dùng userName khi không có userSlug', async () => {
    const u = { userName: 'bob', warehouses: [w('x'), w('y')] }
    await useWarehouseStore.getState().resolveFor(u)
    await useWarehouseStore.getState().select(w('x'))
    expect(await kv.get('warehouse.lastWarehouse.bob')).toBe('x')
  })

  it('kho duy nhất được tự chọn và lưu', async () => {
    await useWarehouseStore.getState().resolveFor(user('a', [w('x')]))
    expect(useWarehouseStore.getState().current).toEqual(w('x'))
    expect(await kv.get('warehouse.lastWarehouse.a')).toBe('x')
  })

  it('không có kho: resolution none', async () => {
    await useWarehouseStore.getState().resolveFor(user('a', []))
    expect(useWarehouseStore.getState().resolution).toBe('none')
    expect(useWarehouseStore.getState().current).toBeNull()
  })

  it('reset xoá trạng thái', async () => {
    await useWarehouseStore.getState().resolveFor(user('a', [w('x')]))
    useWarehouseStore.getState().reset()
    expect(useWarehouseStore.getState()).toMatchObject({
      current: null,
      resolved: false,
      resolution: null,
    })
  })

  it('kết quả đọc kv trễ không ghi đè sau reset', async () => {
    let release!: (v: string | null) => void
    const spy = jest
      .spyOn(kv, 'get')
      .mockImplementationOnce(() => new Promise((r) => (release = r as (v: string | null) => void)))
    const p = useWarehouseStore.getState().resolveFor(user('a'))
    useWarehouseStore.getState().reset()
    release('x')
    await p
    expect(useWarehouseStore.getState()).toMatchObject({ current: null, resolved: false })
    spy.mockRestore()
  })

  it('resolveFor mới thắng resolveFor cũ đang chờ', async () => {
    let release!: (v: string | null) => void
    const spy = jest
      .spyOn(kv, 'get')
      .mockImplementationOnce(() => new Promise((r) => (release = r as (v: string | null) => void)))
    const first = useWarehouseStore.getState().resolveFor(user('a'))
    await useWarehouseStore.getState().resolveFor(user('b', [w('z')]))
    release('x')
    await first
    expect(useWarehouseStore.getState().current).toEqual(w('z'))
    spy.mockRestore()
  })

  it('select bị bỏ qua nếu reset trong lúc ghi kv', async () => {
    await useWarehouseStore.getState().resolveFor(user('a'))
    const p = useWarehouseStore.getState().select(w('x'))
    useWarehouseStore.getState().reset()
    await p
    expect(useWarehouseStore.getState().current).toBeNull()
  })

  it('select không có key (chưa resolveFor) thì ném lỗi và không đổi state', async () => {
    await expect(useWarehouseStore.getState().select(w('x'))).rejects.toThrow(
      'select() before resolveFor',
    )
    expect(useWarehouseStore.getState()).toMatchObject({
      current: null,
      resolved: false,
      resolution: null,
    })
  })

  it('select sau reset cũng ném lỗi', async () => {
    await useWarehouseStore.getState().resolveFor(user('a'))
    useWarehouseStore.getState().reset()
    await expect(useWarehouseStore.getState().select(w('x'))).rejects.toThrow()
    expect(useWarehouseStore.getState().current).toBeNull()
  })
})

/** Kho như `GET /warehouses` trả. */
const apiWh = (slug: string, over: object = {}) => ({
  slug,
  code: slug.toUpperCase(),
  name: `Kho ${slug}`,
  isActive: true,
  ...over,
})
const onePage = (items: object[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 100, totalPages: 1, hasNext: false })
const all = (slug: string) => ({ ...w(slug), isActive: true })

describe('warehouse store — nguồn "all" (ADMIN / SUPER_ADMIN: GET /warehouses)', () => {
  const admin = { userSlug: 'ad', userName: 'admin', warehouses: [] }

  it('ADMIN chưa gắn kho nào + API trả 3 kho (1 đã tắt) → choose (không phải none), giữ danh sách', async () => {
    route('get', '/warehouses', () =>
      onePage([apiWh('x'), apiWh('y', { isActive: false }), apiWh('z')]),
    )
    await useWarehouseStore.getState().resolveFor(admin, 'all')
    const s = useWarehouseStore.getState()
    expect(s).toMatchObject({ resolved: true, resolution: 'choose', current: null })
    expect(s.warehouses?.map((x) => [x.slug, x.isActive])).toEqual([
      ['x', true],
      ['y', false],
      ['z', true],
    ])
  })

  it('kho dùng lần trước còn trong danh sách → chọn lại (kể cả kho đã tắt)', async () => {
    await kv.set('warehouse.lastWarehouse.ad', 'y')
    route('get', '/warehouses', () =>
      onePage([apiWh('x'), apiWh('y', { isActive: false }), apiWh('z')]),
    )
    await useWarehouseStore.getState().resolveFor(admin, 'all')
    expect(useWarehouseStore.getState()).toMatchObject({
      resolution: 'selected',
      current: { slug: 'y', isActive: false },
    })
  })

  it('đúng một kho → tự chọn và lưu; không kho nào → none', async () => {
    route('get', '/warehouses', () => onePage([apiWh('x')]))
    await useWarehouseStore.getState().resolveFor(admin, 'all')
    expect(useWarehouseStore.getState()).toMatchObject({
      resolution: 'selected',
      current: all('x'),
    })
    expect(await kv.get('warehouse.lastWarehouse.ad')).toBe('x')

    useWarehouseStore.getState().reset()
    route('get', '/warehouses', () => onePage([]))
    await useWarehouseStore.getState().resolveFor(admin, 'all')
    expect(useWarehouseStore.getState()).toMatchObject({ resolution: 'none', current: null })
  })

  it('API lỗi → resolution error (giữ lỗi), retry() gọi lại và thành công', async () => {
    route('get', '/warehouses', () => failure(500))
    await useWarehouseStore.getState().resolveFor(admin, 'all')
    expect(useWarehouseStore.getState()).toMatchObject({
      resolved: true,
      resolution: 'error',
      current: null,
      warehouses: null,
    })
    expect(useWarehouseStore.getState().error).toBeTruthy()

    route('get', '/warehouses', () => onePage([apiWh('x'), apiWh('y')]))
    await useWarehouseStore.getState().retry()
    expect(callsTo('get', '/warehouses')).toHaveLength(2)
    expect(useWarehouseStore.getState()).toMatchObject({ resolution: 'choose', error: null })
    // retry đã resolve cho đúng user → select() dùng được.
    await useWarehouseStore.getState().select(all('y'))
    expect(await kv.get('warehouse.lastWarehouse.ad')).toBe('y')
  })

  it('retry() sau reset (hết phiên) không làm gì', async () => {
    route('get', '/warehouses', () => failure(500))
    await useWarehouseStore.getState().resolveFor(admin, 'all')
    useWarehouseStore.getState().reset()
    await useWarehouseStore.getState().retry()
    expect(callsTo('get', '/warehouses')).toHaveLength(1)
    expect(useWarehouseStore.getState()).toMatchObject({ resolution: null, resolved: false })
  })

  it('kết quả tải kho về trễ sau reset / đăng xuất → bị bỏ', async () => {
    let release!: () => void
    route(
      'get',
      '/warehouses',
      () => new Promise((r) => (release = () => r(onePage([apiWh('x'), apiWh('y')])))),
    )
    const p = useWarehouseStore.getState().resolveFor(admin, 'all')
    await new Promise((r) => setTimeout(r, 0))
    useWarehouseStore.getState().reset()
    release()
    await p
    expect(useWarehouseStore.getState()).toMatchObject({
      resolved: false,
      resolution: null,
      warehouses: null,
    })
  })

  it('lỗi về trễ sau khi resolveFor mới đã xong → không ghi đè', async () => {
    let fail!: () => void
    route('get', '/warehouses', () => new Promise((r) => (fail = () => r(failure(500)))))
    const p = useWarehouseStore.getState().resolveFor(admin, 'all')
    await new Promise((r) => setTimeout(r, 0))
    await useWarehouseStore.getState().resolveFor(user('m', [w('x')]))
    fail()
    await p
    expect(useWarehouseStore.getState()).toMatchObject({ resolution: 'selected', error: null })
  })

  it('đang tải: resolved vẫn false, resolution vẫn null (SessionGate giữ màn chờ)', async () => {
    let release!: () => void
    route(
      'get',
      '/warehouses',
      () => new Promise((r) => (release = () => r(onePage([apiWh('x'), apiWh('y')])))),
    )
    const p = useWarehouseStore.getState().resolveFor(admin, 'all')
    await new Promise((r) => setTimeout(r, 0))
    expect(useWarehouseStore.getState()).toMatchObject({ resolved: false, resolution: null })
    release()
    await p
    expect(useWarehouseStore.getState().resolution).toBe('choose')
  })

  it('nguồn "mine" (MANAGER, mặc định) không gọi /warehouses, không giữ danh sách', async () => {
    await useWarehouseStore.getState().resolveFor(user('a'))
    await useWarehouseStore.getState().resolveFor(user('a'), 'mine')
    expect(callsTo('get', '/warehouses')).toHaveLength(0)
    expect(useWarehouseStore.getState()).toMatchObject({ resolution: 'choose', warehouses: null })
  })

  it('đổi từ "all" sang "mine" (vai trò đổi) → bỏ danh sách đã tải', async () => {
    route('get', '/warehouses', () => onePage([apiWh('x'), apiWh('y')]))
    await useWarehouseStore.getState().resolveFor(admin, 'all')
    expect(useWarehouseStore.getState().warehouses).toHaveLength(2)
    await useWarehouseStore.getState().resolveFor({ ...admin, warehouses: [w('x')] }, 'mine')
    expect(useWarehouseStore.getState()).toMatchObject({ warehouses: null, current: w('x') })
  })
})

describe('warehouse store — revalidate() (ADMIN+ quay lại app)', () => {
  const admin = { userSlug: 'ad', userName: 'admin', warehouses: [] }
  const tick = () => new Promise((r) => setTimeout(r, 0))

  async function adminSelected(slug: string, list: object[]) {
    route('get', '/warehouses', () => onePage(list))
    await useWarehouseStore.getState().resolveFor(admin, 'all')
    await useWarehouseStore
      .getState()
      .select(useWarehouseStore.getState().warehouses!.find((x) => x.slug === slug)!)
  }

  it('kho đang chọn bị xoá trên server → resolve lại (còn một kho → tự chọn; nhiều → choose)', async () => {
    await adminSelected('x', [apiWh('x'), apiWh('y')])
    route('get', '/warehouses', () => onePage([apiWh('y')]))
    await useWarehouseStore.getState().revalidate()
    expect(useWarehouseStore.getState()).toMatchObject({
      resolution: 'selected',
      current: all('y'),
    })
    expect(await kv.get('warehouse.lastWarehouse.ad')).toBe('y')

    route('get', '/warehouses', () => onePage([apiWh('z'), apiWh('w')]))
    await useWarehouseStore.getState().revalidate()
    expect(useWarehouseStore.getState()).toMatchObject({ resolution: 'choose', current: null })
    expect(useWarehouseStore.getState().warehouses?.map((x) => x.slug)).toEqual(['w', 'z'])
  })

  it('kho mới được tạo → có trong danh sách, kho đang chọn giữ nguyên', async () => {
    await adminSelected('x', [apiWh('x'), apiWh('y')])
    route('get', '/warehouses', () => onePage([apiWh('x'), apiWh('y'), apiWh('n')]))
    await useWarehouseStore.getState().revalidate()
    expect(useWarehouseStore.getState().warehouses?.map((x) => x.slug)).toEqual(['n', 'x', 'y'])
    expect(useWarehouseStore.getState()).toMatchObject({
      resolution: 'selected',
      current: all('x'),
    })
  })

  it('chưa có kho (none) → kho mới được tạo → tự chọn', async () => {
    route('get', '/warehouses', () => onePage([]))
    await useWarehouseStore.getState().resolveFor(admin, 'all')
    expect(useWarehouseStore.getState().resolution).toBe('none')
    route('get', '/warehouses', () => onePage([apiWh('n')]))
    await useWarehouseStore.getState().revalidate()
    expect(useWarehouseStore.getState()).toMatchObject({
      resolution: 'selected',
      current: all('n'),
    })
  })

  it('kho đang chọn bị tắt / đổi tên → cập nhật cả current lẫn danh sách (viên "Đã tắt")', async () => {
    await adminSelected('x', [apiWh('x'), apiWh('y')])
    route('get', '/warehouses', () =>
      onePage([apiWh('x', { isActive: false, name: 'Kho x mới' }), apiWh('y')]),
    )
    await useWarehouseStore.getState().revalidate()
    const s = useWarehouseStore.getState()
    expect(s.resolution).toBe('selected')
    expect(s.current).toMatchObject({ slug: 'x', isActive: false, name: 'Kho x mới' })
    expect(s.warehouses?.find((x) => x.slug === 'x')?.isActive).toBe(false)
  })

  it('tải lại lỗi → giữ nguyên trạng thái (không sang error khi đang ở tab)', async () => {
    await adminSelected('x', [apiWh('x'), apiWh('y')])
    const before = useWarehouseStore.getState()
    route('get', '/warehouses', () => 'network')
    await useWarehouseStore.getState().revalidate()
    const after = useWarehouseStore.getState()
    expect(after.resolution).toBe('selected')
    expect(after.current).toBe(before.current)
    expect(after.warehouses).toBe(before.warehouses)
    expect(after.error).toBeNull()
  })

  it('select() trong lúc đang tải lại → lựa chọn của người dùng thắng (danh sách mới vẫn được nhận)', async () => {
    await adminSelected('x', [apiWh('x'), apiWh('y')])
    let release!: () => void
    route(
      'get',
      '/warehouses',
      () => new Promise((r) => (release = () => r(onePage([apiWh('y'), apiWh('n')])))),
    )
    const p = useWarehouseStore.getState().revalidate()
    await tick()
    await useWarehouseStore.getState().select(all('y'))
    release()
    await p
    expect(useWarehouseStore.getState()).toMatchObject({
      resolution: 'selected',
      current: all('y'),
    })
    expect(await kv.get('warehouse.lastWarehouse.ad')).toBe('y')
    expect(useWarehouseStore.getState().warehouses?.map((x) => x.slug)).toEqual(['n', 'y'])
  })

  it('reset (hết phiên) trong lúc tải lại → kết quả bị bỏ', async () => {
    await adminSelected('x', [apiWh('x'), apiWh('y')])
    let release!: () => void
    route(
      'get',
      '/warehouses',
      () => new Promise((r) => (release = () => r(onePage([apiWh('n')])))),
    )
    const p = useWarehouseStore.getState().revalidate()
    await tick()
    useWarehouseStore.getState().reset()
    release()
    await p
    expect(useWarehouseStore.getState()).toMatchObject({
      resolution: null,
      current: null,
      warehouses: null,
    })
  })

  it('nguồn "mine", đang lỗi, hoặc chưa resolve → không làm gì', async () => {
    await useWarehouseStore.getState().revalidate()
    await useWarehouseStore.getState().resolveFor(user('a'))
    await useWarehouseStore.getState().revalidate()
    route('get', '/warehouses', () => failure(500))
    await useWarehouseStore.getState().resolveFor(admin, 'all')
    await useWarehouseStore.getState().revalidate()
    expect(callsTo('get', '/warehouses')).toHaveLength(1)
    expect(useWarehouseStore.getState().resolution).toBe('error')
  })

  it('select() trong lúc resolveFor "all" đang tải → giữ lựa chọn VÀ giữ danh sách đã tải', async () => {
    let release!: () => void
    route(
      'get',
      '/warehouses',
      () => new Promise((r) => (release = () => r(onePage([apiWh('x'), apiWh('y')])))),
    )
    const p = useWarehouseStore.getState().resolveFor(admin, 'all')
    await tick()
    await useWarehouseStore.getState().select(all('y'))
    release()
    await p
    expect(useWarehouseStore.getState()).toMatchObject({
      resolution: 'selected',
      current: all('y'),
    })
    expect(useWarehouseStore.getState().warehouses?.map((x) => x.slug)).toEqual(['x', 'y'])
  })
})
