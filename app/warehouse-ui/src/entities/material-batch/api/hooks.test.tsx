import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { useBatchesOfMaterials, useMaterialBatches } from './hooks'
import type { MaterialBatch } from '../model/types'

const URL_W = 'http://localhost:8085/api/v1/warehouses/w-a/material-batches'

function Probe({ enabled }: { enabled: boolean }) {
  const q = useMaterialBatches('w-a', 'm-1', { enabled })
  return <output data-testid="n">{q.data ? String(q.data.length) : 'none'}</output>
}

function SlugProbe() {
  const q = useMaterialBatches('w-a', 'm-1', { enabled: true })
  return <output data-testid="s">{q.data?.map((x) => x.slug).join(',')}</output>
}

describe('useMaterialBatches', () => {
  it('gửi bộ lọc còn hàng, hạn gần trước, và trả items', async () => {
    let search = ''
    server.use(
      mswHttp.get(URL_W, ({ request }) => {
        search = new URL(request.url).search
        return paginated([{ slug: 'b-1' } as MaterialBatch])
      }),
    )
    renderWithProviders(<Probe enabled />)
    await waitFor(() => expect(screen.getByTestId('n')).toHaveTextContent('1'))
    expect(search).toContain('status=1')
    expect(search).toContain('sortBy=expiryDate')
    expect(search).toContain('sort=ASC')
    expect(search).toContain('materialSlug=m-1')
    expect(search).toContain('size=100')
  })

  it('đưa lô không hạn xuống cuối dù BE trả null trước', async () => {
    server.use(
      mswHttp.get(URL_W, () =>
        paginated([
          { slug: 'n', expiryDate: null, entryDate: '2026-01-01' },
          { slug: 'a', expiryDate: '2026-12-01', entryDate: '2026-01-01' },
        ] as MaterialBatch[]),
      ),
    )
    renderWithProviders(<SlugProbe />)
    await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('a,n'))
  })

  it('enabled=false → không gọi API', async () => {
    let called = false
    server.use(
      mswHttp.get(URL_W, () => {
        called = true
        return paginated([])
      }),
    )
    renderWithProviders(<Probe enabled={false} />)
    await new Promise((r) => setTimeout(r, 50))
    expect(called).toBe(false)
    expect(screen.getByTestId('n')).toHaveTextContent('none')
  })
})

function ManyProbe({ slugs, enabled = true }: { slugs: string[]; enabled?: boolean }) {
  const map = useBatchesOfMaterials('w-a', slugs, { enabled })
  const text = [...map]
    .map(([m, list]) => `${m}:${list.map((b) => b.slug).join('+')}`)
    .sort()
    .join(',')
  return <output data-testid="m">{text}</output>
}

describe('useBatchesOfMaterials', () => {
  it('tải lô của từng vật tư (cùng bộ lọc với ô chọn lô), trả theo vật tư', async () => {
    const searches: string[] = []
    server.use(
      mswHttp.get(URL_W, ({ request }) => {
        const params = new URL(request.url).searchParams
        searches.push(params.toString())
        const m = params.get('materialSlug')
        return paginated([{ slug: `b-${m}`, materialSlug: m } as MaterialBatch])
      }),
    )
    renderWithProviders(<ManyProbe slugs={['m-1', 'm-2', 'm-1']} />)
    await waitFor(() => expect(screen.getByTestId('m')).toHaveTextContent('m-1:b-m-1,m-2:b-m-2'))
    // Vật tư trùng chỉ gọi một lần; bộ lọc giống `useMaterialBatches` để dùng chung cache.
    expect(searches).toHaveLength(2)
    for (const s of searches) {
      expect(s).toContain('status=1')
      expect(s).toContain('sortBy=expiryDate')
      expect(s).toContain('size=100')
    }
  })

  it('enabled=false → không gọi API, map rỗng', async () => {
    let called = false
    server.use(
      mswHttp.get(URL_W, () => {
        called = true
        return paginated([])
      }),
    )
    renderWithProviders(<ManyProbe slugs={['m-1']} enabled={false} />)
    await new Promise((r) => setTimeout(r, 50))
    expect(called).toBe(false)
    expect(screen.getByTestId('m')).toHaveTextContent('')
  })
})

describe('useBatchesOfMaterials — danh sách rỗng', () => {
  it('vật tư đã tải mà không còn lô nào → vẫn có mục (danh sách rỗng), khác với chưa tải', async () => {
    server.use(mswHttp.get(URL_W, () => paginated([])))
    renderWithProviders(<ManyProbe slugs={['m-1']} />)
    await waitFor(() => expect(screen.getByTestId('m')).toHaveTextContent('m-1:'))
  })
})
