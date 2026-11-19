// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'

import type { CurrentUser, UserWarehouse } from '@/entities/session'

import {
  assignToWarehouses,
  canAssignWarehouse,
  canAttachSupplier,
  canCreateInWarehouse,
  classifyAssignError,
  classifyRemoveError,
  removeBlock,
  warehousePickStates,
} from './assign'

const user = (scope: string[]): CurrentUser => ({ userName: 'u', roleName: 'STAFF', scope })
const wh = (slug: string, over: Partial<UserWarehouse> = {}): UserWarehouse => ({
  slug,
  code: slug,
  name: slug,
  isManager: false,
  ...over,
})
const api = (statusCode: number, code?: number) => ({ statusCode, code, message: 'x' })

describe('canAssignWarehouse', () => {
  it('cần cả hai quyền', () => {
    expect(canAssignWarehouse(user(['MATERIAL_UPDATE']))).toBe(false)
    expect(canAssignWarehouse(user(['WAREHOUSE_UPDATE']))).toBe(false)
    expect(canAssignWarehouse(user(['MATERIAL_UPDATE', 'WAREHOUSE_UPDATE']))).toBe(true)
    expect(canAssignWarehouse(null)).toBe(false)
  })
})

describe('canAttachSupplier', () => {
  it('cần SUPPLIER_READ + SUPPLIER_UPDATE + MATERIAL_UPDATE', () => {
    const ALL = ['SUPPLIER_READ', 'SUPPLIER_UPDATE', 'MATERIAL_UPDATE']
    expect(canAttachSupplier(user(ALL))).toBe(true)
    for (const missing of ALL) {
      expect(canAttachSupplier(user(ALL.filter((p) => p !== missing)))).toBe(false)
    }
    expect(canAttachSupplier(null)).toBe(false)
  })
})

describe('canCreateInWarehouse', () => {
  const ALL = ['MATERIAL_CREATE', 'MATERIAL_UPDATE', 'WAREHOUSE_UPDATE', 'UNIT_READ']
  it('đủ bốn quyền → true; thiếu từng quyền → false', () => {
    expect(canCreateInWarehouse(user(ALL))).toBe(true)
    for (const missing of ALL) {
      expect(canCreateInWarehouse(user(ALL.filter((p) => p !== missing)))).toBe(false)
    }
    expect(canCreateInWarehouse(null)).toBe(false)
  })
})

describe('warehousePickStates', () => {
  const have = (slug: string) => ({
    slug,
    code: slug,
    name: slug,
    quantity: 0,
    availableQuantity: 0,
  })
  it('bỏ kho đã gắn (kể cả kho tắt), kho tắt → locked, còn lại pickable; giữ thứ tự', () => {
    const [a, b, c, d] = [
      wh('a'),
      wh('b', { isActive: false }),
      wh('c', { isActive: true }),
      wh('d', { isActive: false }),
    ]
    const material = { warehouses: [have('a'), have('d')] }
    expect(warehousePickStates([a, b, c, d], material)).toEqual([
      { warehouse: b, state: 'locked' },
      { warehouse: c, state: 'pickable' },
    ])
  })
  it('isActive vắng → pickable', () => {
    expect(warehousePickStates([wh('x')], { warehouses: [] })).toEqual([
      { warehouse: wh('x'), state: 'pickable' },
    ])
  })
})

describe('assignToWarehouses', () => {
  const put = (s: string) => `/warehouses/${s}/materials`
  beforeEach(() => resetFakeApi())
  const reply = (status: number, body: object) => ({
    status,
    data: { timestamp: '', path: '', method: 'X', ...body },
  })

  it('lỗi một kho không dừng các kho sau; tuần tự; body chỉ { materialSlug }', async () => {
    route('put', put('w1'), () => ok({}))
    route('put', put('w2'), () => reply(400, { statusCode: 400, code: 100802, message: 'x' }))
    route('put', put('w3'), () => ok({}))
    const r = await assignToWarehouses('m1', ['w1', 'w2', 'w3'], () => false)
    expect(r.stale).toBe(false)
    expect(r.ok).toEqual(['w1', 'w3'])
    expect(r.failed).toHaveLength(1)
    expect(r.failed[0]).toMatchObject({ slug: 'w2', reason: 'reassign' })
    for (const s of ['w1', 'w2', 'w3']) {
      const c = callsTo('put', put(s))
      expect(c).toHaveLength(1)
      expect(JSON.parse(c[0].body as string)).toEqual({ materialSlug: 'm1' })
    }
  })

  it('isStale thành true sau PUT đầu → chỉ 1 PUT, stale', async () => {
    route('put', put('w1'), () => ok({}))
    route('put', put('w2'), () => ok({}))
    let n = 0
    const r = await assignToWarehouses('m1', ['w1', 'w2'], () => n++ >= 2)
    expect(r.stale).toBe(true)
    expect(callsTo('put', put('w1'))).toHaveLength(1)
    expect(callsTo('put', put('w2'))).toHaveLength(0)
  })

  it('stale ngay từ đầu → không PUT nào', async () => {
    const r = await assignToWarehouses('m1', ['w1'], () => true)
    expect(r).toEqual({ ok: [], failed: [], stale: true })
  })
})

describe('removeBlock', () => {
  const w = (quantity: number, availableQuantity: number) => ({
    slug: 's',
    code: 'c',
    name: 'n',
    quantity,
    availableQuantity,
  })
  it('phân loại', () => {
    expect(removeBlock(w(2, 2))).toBe('stock')
    expect(removeBlock(w(0, -1))).toBe('reserved')
    expect(removeBlock(w(2, 0))).toBe('stock')
    expect(removeBlock(w(0, 0))).toBeNull()
  })
})

describe('classifyAssignError', () => {
  it('theo mã', () => {
    expect(classifyAssignError(api(400, 100802))).toBe('reassign')
    expect(classifyAssignError(api(404))).toBe('notFound')
  })
  it('còn lại → general', () => {
    expect(classifyAssignError(new Error('Network Error'))).toBe('general')
    expect(classifyAssignError(api(403))).toBe('general')
    expect(classifyAssignError(api(400, 100804))).toBe('general')
    expect(classifyAssignError(api(500))).toBe('general')
  })
})

describe('classifyRemoveError', () => {
  it('theo mã', () => {
    expect(classifyRemoveError(api(404, 100801))).toBe('gone')
    expect(classifyRemoveError(api(404))).toBe('gone')
    expect(classifyRemoveError(api(400, 100807))).toBe('blocked')
    expect(classifyRemoveError(api(400, 100813))).toBe('blocked')
    expect(classifyRemoveError(api(500))).toBe('general')
    expect(classifyRemoveError(new Error('x'))).toBe('general')
  })
})
