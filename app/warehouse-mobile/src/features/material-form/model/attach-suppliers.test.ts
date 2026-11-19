// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'

import { attachToSuppliers } from './attach-suppliers'

beforeEach(() => resetFakeApi())

describe('attachToSuppliers', () => {
  it('gắn lần lượt từng bên bán, body { materialSlugs: [slug] }', async () => {
    route('put', '/suppliers/s1/materials', () => ok({}))
    route('put', '/suppliers/s2/materials', () => ok({}))
    const r = await attachToSuppliers('m1', ['s1', 's2'], () => false)
    expect(r).toEqual({ ok: ['s1', 's2'], failed: [], stale: false })
    expect(JSON.parse(callsTo('put', '/suppliers/s2/materials')[0].body as string)).toEqual({
      materialSlugs: ['m1'],
    })
  })

  it('lỗi một bên bán không dừng các bên sau', async () => {
    route('put', '/suppliers/s1/materials', () => ({
      status: 500,
      data: { timestamp: '', path: '', method: 'PUT', statusCode: 500, message: 'x' },
    }))
    route('put', '/suppliers/s2/materials', () => ok({}))
    const r = await attachToSuppliers('m1', ['s1', 's2'], () => false)
    expect(r.ok).toEqual(['s2'])
    expect(r.failed.map((f) => f.slug)).toEqual(['s1'])
    expect(r.stale).toBe(false)
  })

  it('phiên đổi trước lần gọi → dừng, không gọi thêm', async () => {
    route('put', '/suppliers/s1/materials', () => ok({}))
    const r = await attachToSuppliers('m1', ['s1'], () => true)
    expect(r.stale).toBe(true)
    expect(callsTo('put', '/suppliers/s1/materials')).toHaveLength(0)
  })

  it('phiên đổi giữa lúc gọi → stale, không gọi bên sau', async () => {
    let stale = false
    route('put', '/suppliers/s1/materials', () => {
      stale = true
      return ok({})
    })
    route('put', '/suppliers/s2/materials', () => ok({}))
    const r = await attachToSuppliers('m1', ['s1', 's2'], () => stale)
    expect(r.stale).toBe(true)
    expect(callsTo('put', '/suppliers/s2/materials')).toHaveLength(0)
  })
})
