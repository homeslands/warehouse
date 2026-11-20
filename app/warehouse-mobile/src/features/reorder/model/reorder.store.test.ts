import AsyncStorage from '@react-native-async-storage/async-storage'

import type { InventoryItem } from '@/entities/inventory'
import { item } from '@/entities/inventory/model/fixtures'
import { kv } from '@/shared/storage/kv'

import type { ReorderLocal } from './reorder'
import { pruneLocal, reorderStorageKey, todayKey, useReorderStore } from './reorder.store'

let mockEpoch = 1
jest.mock('@/entities/session', () => ({ getSessionEpoch: () => mockEpoch }))

const TODAY = '2026-11-19'

/** min 10, max 30; tồn mặc định 4 (đỏ). */
const inv = (materialSlug: string, quantity = 4, over: Partial<InventoryItem> = {}) =>
  item({
    slug: `inv-${materialSlug}`,
    materialSlug,
    quantity,
    effectiveMinimumInventory: 10,
    effectiveMaximumInventory: 30,
    ...over,
  })

const full: ReorderLocal = {
  qty: { value: 5, unitSlug: 'u-bag' },
  supplierSlug: 'sup-a',
  orderedAt: TODAY,
}

const initial = useReorderStore.getState()

/** Chờ các promise AsyncStorage (mock) chạy xong. */
const flush = () => new Promise<void>((r) => setImmediate(r))

const stored = async (user: string, wh: string) => {
  const raw = await AsyncStorage.getItem(reorderStorageKey(user, wh))
  return raw === null ? null : (JSON.parse(raw) as Record<string, ReorderLocal>)
}

beforeEach(async () => {
  mockEpoch = 1
  useReorderStore.setState(initial, true)
  await AsyncStorage.clear()
  jest.restoreAllMocks()
})

describe('reorderStorageKey / todayKey', () => {
  it('khoá theo user + kho', () => {
    expect(reorderStorageKey('u1', 'wh-1')).toBe('reorder.v1.u1.wh-1')
  })

  it('todayKey = yyyy-MM-dd theo giờ máy', () => {
    expect(todayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('pruneLocal', () => {
  it('vật tư ra khỏi danh sách (reorderLevel null, tồn > min*1.2) → xoá qty + orderedAt, GIỮ supplierSlug; vật tư vàng GIỮ dấu', () => {
    const local = { out: full, yellow: full, red: full, edge: full }
    const items = [
      inv('out', 12.5), // > 12 → ra khỏi danh sách
      inv('yellow', 11), // 10 <= 11 <= 12 → vàng
      inv('red', 4),
      inv('edge', 12), // đúng min*1.2 → vẫn vàng
    ]
    expect(pruneLocal(local, items, TODAY)).toEqual({
      out: { supplierSlug: 'sup-a' },
      yellow: full,
      red: full,
      edge: full,
    })
  })

  it('min <= 0 → ra khỏi danh sách: xoá qty + orderedAt; mục rỗng thì bỏ', () => {
    const local = { a: full, b: { qty: full.qty, orderedAt: TODAY } }
    const items = [inv('a', 5, { effectiveMinimumInventory: 0 }), inv('b', 50)]
    expect(pruneLocal(local, items, TODAY)).toEqual({ a: { supplierSlug: 'sup-a' } })
  })

  it('orderedAt cũ hơn 7 ngày → xoá orderedAt + qty; đúng 7 ngày → giữ', () => {
    const local = {
      week: { ...full, orderedAt: '2026-11-12' },
      old: { ...full, orderedAt: '2026-11-11' },
      oldNoSupplier: { qty: full.qty, orderedAt: '2026-10-01' },
    }
    const items = [inv('week'), inv('old'), inv('oldNoSupplier')]
    expect(pruneLocal(local, items, TODAY)).toEqual({
      week: { ...full, orderedAt: '2026-11-12' },
      old: { supplierSlug: 'sup-a' },
    })
  })

  it('qty không kèm orderedAt không hết hạn theo ngày', () => {
    const local = { a: { qty: full.qty } }
    expect(pruneLocal(local, [inv('a')], TODAY)).toEqual(local)
  })

  it('vật tư không còn trong tồn → xoá cả mục (kể cả supplierSlug)', () => {
    const local = { gone: full, kept: { supplierSlug: 'sup-b' } }
    expect(pruneLocal(local, [inv('kept', 999)], TODAY)).toEqual({
      kept: { supplierSlug: 'sup-b' },
    })
    expect(pruneLocal(local, [], TODAY)).toEqual({})
  })

  it('không đổi gì → trả đúng object cũ', () => {
    const local = { a: full }
    expect(pruneLocal(local, [inv('a')], TODAY)).toBe(local)
  })
})

describe('useReorderStore', () => {
  it('load đọc kv theo khoá user+kho; đổi scope thì local của scope cũ không còn', async () => {
    await AsyncStorage.setItem(reorderStorageKey('u1', 'wh-1'), JSON.stringify({ a: full }))
    await AsyncStorage.setItem(
      reorderStorageKey('u1', 'wh-2'),
      JSON.stringify({ b: { supplierSlug: 'sup-b' } }),
    )

    await useReorderStore.getState().load('u1', 'wh-1')
    expect(useReorderStore.getState()).toMatchObject({
      scope: 'u1|wh-1',
      loaded: true,
      local: { a: full },
    })

    const pending = useReorderStore.getState().load('u1', 'wh-2')
    // Ngay khi đổi scope: không còn thấy dữ liệu của kho cũ.
    expect(useReorderStore.getState()).toMatchObject({ scope: 'u1|wh-2', loaded: false, local: {} })
    await pending
    expect(useReorderStore.getState().local).toEqual({ b: { supplierSlug: 'sup-b' } })

    await useReorderStore.getState().load('u2', 'wh-2')
    expect(useReorderStore.getState()).toMatchObject({ scope: 'u2|wh-2', loaded: true, local: {} })
  })

  it('kv hỏng (không phải object) → local rỗng', async () => {
    await AsyncStorage.setItem(reorderStorageKey('u1', 'wh-1'), JSON.stringify([1, 2]))
    await useReorderStore.getState().load('u1', 'wh-1')
    expect(useReorderStore.getState()).toMatchObject({ loaded: true, local: {} })
  })

  it('ghi (setQty/markOrdered/…) lưu kv đúng khoá của scope hiện tại', async () => {
    await useReorderStore.getState().load('u1', 'wh-1')
    await useReorderStore.getState().load('u1', 'wh-2')
    const s = useReorderStore.getState()
    s.setQty('a', { value: 3, unitSlug: 'u-box' })
    s.setSupplier('a', 'sup-a')
    s.markOrdered(['a', 'b'], TODAY)
    await flush()

    const expected = {
      a: { qty: { value: 3, unitSlug: 'u-box' }, supplierSlug: 'sup-a', orderedAt: TODAY },
      b: { orderedAt: TODAY },
    }
    expect(useReorderStore.getState().local).toEqual(expected)
    expect(await stored('u1', 'wh-2')).toEqual(expected)
    expect(await stored('u1', 'wh-1')).toBeNull()
  })

  it('ghi trước khi load xong → bỏ qua (không ghi đè dữ liệu chưa đọc)', async () => {
    await AsyncStorage.setItem(reorderStorageKey('u1', 'wh-1'), JSON.stringify({ a: full }))
    const pending = useReorderStore.getState().load('u1', 'wh-1')
    useReorderStore.getState().setSupplier('z', 'sup-z')
    await pending
    expect(useReorderStore.getState().local).toEqual({ a: full })
    expect(await stored('u1', 'wh-1')).toEqual({ a: full })
  })

  it('load chậm của scope cũ về sau khi đã load scope mới → bỏ qua', async () => {
    await AsyncStorage.setItem(reorderStorageKey('u1', 'wh-1'), JSON.stringify({ old: full }))
    await AsyncStorage.setItem(
      reorderStorageKey('u1', 'wh-2'),
      JSON.stringify({ fresh: { supplierSlug: 'sup-b' } }),
    )
    const realGet = kv.get.bind(kv)
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    jest.spyOn(kv, 'get').mockImplementation(async <T>(key: string) => {
      if (key === reorderStorageKey('u1', 'wh-1')) await gate
      return realGet<T>(key)
    })

    const slow = useReorderStore.getState().load('u1', 'wh-1')
    await useReorderStore.getState().load('u1', 'wh-2')
    release()
    await slow

    expect(useReorderStore.getState()).toMatchObject({
      scope: 'u1|wh-2',
      loaded: true,
      local: { fresh: { supplierSlug: 'sup-b' } },
    })
  })

  it('phiên đổi khi đang load → bỏ kết quả; load lại cùng scope ở phiên mới thì đọc lại', async () => {
    await AsyncStorage.setItem(reorderStorageKey('u1', 'wh-1'), JSON.stringify({ a: full }))
    const pending = useReorderStore.getState().load('u1', 'wh-1')
    mockEpoch = 2
    await pending
    expect(useReorderStore.getState()).toMatchObject({ loaded: false, local: {} })

    await useReorderStore.getState().load('u1', 'wh-1')
    expect(useReorderStore.getState()).toMatchObject({ loaded: true, local: { a: full } })
  })

  it('load lại cùng scope (cùng phiên) không xoá dữ liệu đang có', async () => {
    await useReorderStore.getState().load('u1', 'wh-1')
    useReorderStore.getState().setSupplier('a', 'sup-a')
    await useReorderStore.getState().load('u1', 'wh-1')
    expect(useReorderStore.getState().local).toEqual({ a: { supplierSlug: 'sup-a' } })
  })

  it('setQty(null) xoá qty; unmarkOrdered xoá orderedAt', async () => {
    await AsyncStorage.setItem(reorderStorageKey('u1', 'wh-1'), JSON.stringify({ a: full }))
    await useReorderStore.getState().load('u1', 'wh-1')
    useReorderStore.getState().setQty('a', null)
    expect(useReorderStore.getState().local.a).toEqual({
      supplierSlug: 'sup-a',
      orderedAt: TODAY,
    })
    useReorderStore.getState().unmarkOrdered('a')
    expect(useReorderStore.getState().local.a).toEqual({ supplierSlug: 'sup-a' })
    await flush()
    expect(await stored('u1', 'wh-1')).toEqual({ a: { supplierSlug: 'sup-a' } })
  })

  it('xoá hết trường của một mục → bỏ mục', async () => {
    await useReorderStore.getState().load('u1', 'wh-1')
    useReorderStore.getState().markOrdered(['a'], TODAY)
    useReorderStore.getState().unmarkOrdered('a')
    expect(useReorderStore.getState().local).toEqual({})
  })

  it('prune: dọn rồi lưu kv; không đổi gì thì không ghi kv', async () => {
    await AsyncStorage.setItem(
      reorderStorageKey('u1', 'wh-1'),
      JSON.stringify({ a: full, gone: full }),
    )
    await useReorderStore.getState().load('u1', 'wh-1')
    const setItem = jest.spyOn(kv, 'set')

    useReorderStore.getState().prune([inv('a', 50)], TODAY)
    await flush()
    expect(useReorderStore.getState().local).toEqual({ a: { supplierSlug: 'sup-a' } })
    expect(await stored('u1', 'wh-1')).toEqual({ a: { supplierSlug: 'sup-a' } })
    expect(setItem).toHaveBeenCalledTimes(1)

    // Tồn tụt lại sau đó: dấu/số cũ không quay về.
    useReorderStore.getState().prune([inv('a', 2)], TODAY)
    await flush()
    expect(useReorderStore.getState().local).toEqual({ a: { supplierSlug: 'sup-a' } })
    expect(setItem).toHaveBeenCalledTimes(1)
  })
})
