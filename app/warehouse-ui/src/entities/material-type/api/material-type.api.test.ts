import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import {
  createMaterialType,
  fetchMaterialTypes,
  removeMaterialType,
  updateMaterialType,
} from './material-type.api'
import type { MaterialType } from '../model/types'

const BASE = 'http://localhost:8085/api/v1'

const type: MaterialType = {
  slug: 'mt-1',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  code: 'MT-01',
  name: 'Vật tư tiêu hao',
  description: null,
}

describe('material-type.api', () => {
  it('GET /material-types gửi page/size + name', async () => {
    let query = ''
    server.use(
      mswHttp.get(`${BASE}/material-types`, ({ request }) => {
        query = new URL(request.url).searchParams.toString()
        return paginated([type])
      }),
    )

    const result = await fetchMaterialTypes({ page: 1, size: 10, name: 'tiêu hao' })

    expect(new URLSearchParams(query).get('name')).toBe('tiêu hao')
    expect(result.items).toEqual([type])
  })

  it('POST / PATCH / DELETE đúng URL và body', async () => {
    const seen: { method: string; path: string; body: unknown }[] = []
    const record = async ({ request }: { request: Request }) => {
      const body = request.method === 'DELETE' ? null : await request.json()
      seen.push({ method: request.method, path: new URL(request.url).pathname, body })
      return ok(request.method === 'DELETE' ? 'mt-1' : type)
    }
    server.use(
      mswHttp.post(`${BASE}/material-types`, record),
      mswHttp.patch(`${BASE}/material-types/mt-1`, record),
      mswHttp.delete(`${BASE}/material-types/mt-1`, record),
    )

    await createMaterialType({ code: 'mt-01', name: 'Vật tư tiêu hao' })
    await updateMaterialType('mt-1', { name: 'Tiêu hao' })
    await removeMaterialType('mt-1')

    expect(seen).toEqual([
      {
        method: 'POST',
        path: '/api/v1/material-types',
        body: { code: 'mt-01', name: 'Vật tư tiêu hao' },
      },
      { method: 'PATCH', path: '/api/v1/material-types/mt-1', body: { name: 'Tiêu hao' } },
      { method: 'DELETE', path: '/api/v1/material-types/mt-1', body: null },
    ])
  })
})
