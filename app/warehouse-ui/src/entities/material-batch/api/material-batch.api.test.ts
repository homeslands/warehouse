import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { fetchMaterialBatches } from './material-batch.api'

const URL_W = 'http://localhost:8085/api/v1/warehouses/w-a/material-batches'

describe('material-batch.api', () => {
  it('GET lô: status/sortBy/sort/materialSlug, bỏ giá trị rỗng', async () => {
    const seen: URLSearchParams[] = []
    server.use(
      mswHttp.get(URL_W, ({ request }) => {
        seen.push(new URL(request.url).searchParams)
        return paginated([])
      }),
    )
    await fetchMaterialBatches('w-a', {
      page: 1,
      size: 100,
      status: 1,
      sortBy: 'expiryDate',
      sort: 'ASC',
      materialSlug: 'm-1',
      expiryBefore: undefined,
    })
    expect(seen[0].get('status')).toBe('1')
    expect(seen[0].get('sortBy')).toBe('expiryDate')
    expect(seen[0].get('sort')).toBe('ASC')
    expect(seen[0].get('materialSlug')).toBe('m-1')
    expect(seen[0].get('size')).toBe('100')
    expect(seen[0].has('expiryBefore')).toBe(false)
  })
})
