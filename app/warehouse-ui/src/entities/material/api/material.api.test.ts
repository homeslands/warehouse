import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { fetchMaterials } from './material.api'
import type { Material } from '../model/types'

const BASE = 'http://localhost:8085/api/v1'

const material: Material = { slug: 'm-1', code: 'VT-01', name: 'Xi măng' }

describe('fetchMaterials', () => {
  it('GET /materials gửi page/size', async () => {
    let query = ''
    server.use(
      mswHttp.get(`${BASE}/materials`, ({ request }) => {
        query = new URL(request.url).searchParams.toString()
        return paginated([material])
      }),
    )

    const result = await fetchMaterials({ page: 1, size: 100 })

    expect(query).toBe(new URLSearchParams({ page: '1', size: '100' }).toString())
    expect(result.items).toEqual([material])
  })
})
