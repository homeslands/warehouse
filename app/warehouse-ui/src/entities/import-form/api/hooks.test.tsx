import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import {
  useAvailableMaterialSearch,
  useConfirmImportForm,
  useCreateImportForm,
  useUpdateImportForm,
} from './hooks'
import { draftForm, flour } from '../model/fixtures'

const BASE = 'http://localhost:8085/api/v1'
const URL_W = `${BASE}/warehouses/w-a/import-forms`

function SearchProbe({ enabled }: { enabled?: boolean }) {
  const q = useAvailableMaterialSearch('w-a', { name: 'xi' }, { enabled })
  return <output data-testid="codes">{(q.data?.items ?? []).map((m) => m.code).join(',')}</output>
}

function MutationProbe({ successToast }: { successToast?: boolean }) {
  const opts = successToast === undefined ? undefined : { successToast }
  const create = useCreateImportForm(opts)
  const update = useUpdateImportForm(opts)
  const confirm = useConfirmImportForm(opts)
  return (
    <div>
      <button
        onClick={() =>
          create.mutate({
            warehouseSlug: 'w-a',
            input: { code: 'PN-1', invoiceCode: 'HD-1', date: '2026-10-12', items: [] },
          })
        }
      >
        create
      </button>
      <button
        onClick={() =>
          update.mutate({ warehouseSlug: 'w-a', slug: 'if-1', input: { version: 3, note: 'x' } })
        }
      >
        update
      </button>
      <button onClick={() => confirm.mutate({ warehouseSlug: 'w-a', slug: 'if-1', version: 3 })}>
        confirm
      </button>
      <output data-testid="status">
        {create.status}/{update.status}/{confirm.status}
      </output>
    </div>
  )
}

describe('useAvailableMaterialSearch', () => {
  it('gọi size=50 kèm name', async () => {
    const seen: string[] = []
    server.use(
      mswHttp.get(`${URL_W}/available-materials`, ({ request }) => {
        seen.push(new URL(request.url).search)
        return paginated([flour])
      }),
    )
    renderWithProviders(<SearchProbe />, { route: '/' })
    await waitFor(() => expect(screen.getByTestId('codes')).toHaveTextContent('VT-01'))
    expect(seen[0]).toContain('size=50')
    expect(seen[0]).toContain('name=xi')
    expect(seen[0]).not.toContain('code=')
  })

  it('enabled:false → không gọi', async () => {
    let hits = 0
    server.use(
      mswHttp.get(`${URL_W}/available-materials`, () => {
        hits += 1
        return paginated([flour])
      }),
    )
    renderWithProviders(<SearchProbe enabled={false} />, { route: '/' })
    await new Promise((r) => setTimeout(r, 50))
    expect(hits).toBe(0)
  })
})

describe('successToast', () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear()
    server.use(
      mswHttp.post(URL_W, () => ok(draftForm)),
      mswHttp.patch(`${URL_W}/if-1`, () => ok(draftForm)),
      mswHttp.post(`${URL_W}/if-1/confirm`, () => ok(draftForm)),
    )
  })

  async function runAll(successToast?: boolean) {
    const { user } = renderWithProviders(<MutationProbe successToast={successToast} />, {
      route: '/',
    })
    await user.click(screen.getByRole('button', { name: 'create' }))
    await user.click(screen.getByRole('button', { name: 'update' }))
    await user.click(screen.getByRole('button', { name: 'confirm' }))
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('success/success/success'),
    )
  }

  it('mặc định vẫn toast cả 3', async () => {
    await runAll()
    expect(toast.success).toHaveBeenCalledTimes(3)
  })

  it('successToast:false → không toast', async () => {
    await runAll(false)
    expect(toast.success).not.toHaveBeenCalled()
  })
})
