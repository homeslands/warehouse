import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { createUnit, fetchUnits, removeUnit, updateUnit } from './unit.api'
import type { Unit } from '../model/types'

const BASE = 'http://localhost:8085/api/v1'

const unit: Unit = {
  slug: 'u-kg',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  code: 'KG',
  name: 'Kilogram',
  description: null,
  materialCount: { asBaseUnit: 2, asConversionUnit: 1, total: 3 },
}

describe('unit.api', () => {
  it('GET /units gửi page/size + bộ lọc, bỏ bộ lọc trống', async () => {
    let query = ''
    server.use(
      mswHttp.get(`${BASE}/units`, ({ request }) => {
        query = new URL(request.url).searchParams.toString()
        return paginated([unit])
      }),
    )

    const result = await fetchUnits({ page: 2, size: 20, code: 'KG', name: undefined })

    expect(new URLSearchParams(query).get('page')).toBe('2')
    expect(new URLSearchParams(query).get('size')).toBe('20')
    expect(new URLSearchParams(query).get('code')).toBe('KG')
    expect(new URLSearchParams(query).has('name')).toBe(false)
    expect(result.items).toEqual([unit])
  })

  it('POST / PATCH / DELETE đúng URL và body', async () => {
    const seen: { method: string; path: string; body: unknown }[] = []
    const record = async ({ request }: { request: Request }) => {
      const body = request.method === 'DELETE' ? null : await request.json()
      seen.push({ method: request.method, path: new URL(request.url).pathname, body })
      return ok(request.method === 'DELETE' ? 'u-kg' : unit)
    }
    server.use(
      mswHttp.post(`${BASE}/units`, record),
      mswHttp.patch(`${BASE}/units/u-kg`, record),
      mswHttp.delete(`${BASE}/units/u-kg`, record),
    )

    await createUnit({ code: 'kg', name: 'Kilogram' })
    await updateUnit('u-kg', { description: '' })
    await removeUnit('u-kg')

    expect(seen).toEqual([
      { method: 'POST', path: '/api/v1/units', body: { code: 'kg', name: 'Kilogram' } },
      { method: 'PATCH', path: '/api/v1/units/u-kg', body: { description: '' } },
      { method: 'DELETE', path: '/api/v1/units/u-kg', body: null },
    ])
  })
})
