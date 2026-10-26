import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { useCreateExportForm, usePendingExportFormCount, useSubmitExportForm } from './hooks'
import { exportFormFixture } from '../model/fixtures'

const BASE = 'http://localhost:8085/api/v1'
const URL_W = `${BASE}/warehouses/w-a/export-forms`

function CountProbe({ enabled }: { enabled?: boolean }) {
  const count = usePendingExportFormCount('w-a', { enabled })
  return <output data-testid="count">{String(count)}</output>
}

function MutationProbe({ successToast }: { successToast?: boolean }) {
  const opts = successToast === undefined ? undefined : { successToast }
  const create = useCreateExportForm(opts)
  const submit = useSubmitExportForm(opts)
  return (
    <div>
      <button
        onClick={() =>
          create.mutate({
            warehouseSlug: 'w-a',
            input: { code: 'PX-1', type: 'SALE', purchaseOrder: 'PO', receiver: 'B', items: [] },
          })
        }
      >
        create
      </button>
      <button onClick={() => submit.mutate({ warehouseSlug: 'w-a', slug: 'xf-1', version: 3 })}>
        submit
      </button>
      <output data-testid="status">
        {create.status}/{submit.status}
      </output>
    </div>
  )
}

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
})

describe('usePendingExportFormCount', () => {
  it('gọi status=PENDING page=1 size=1 và trả total', async () => {
    const seen: string[] = []
    server.use(
      mswHttp.get(URL_W, ({ request }) => {
        seen.push(new URL(request.url).search)
        return paginated([exportFormFixture({ status: 'PENDING' })], { size: 1, total: 7 })
      }),
    )
    renderWithProviders(<CountProbe />, { route: '/' })
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('7'))
    expect(seen[0]).toContain('status=PENDING')
    expect(seen[0]).toContain('page=1')
    expect(seen[0]).toContain('size=1')
  })

  it('enabled=false → không gọi, trả undefined', async () => {
    let called = false
    server.use(
      mswHttp.get(URL_W, () => {
        called = true
        return paginated([])
      }),
    )
    renderWithProviders(<CountProbe enabled={false} />, { route: '/' })
    expect(screen.getByTestId('count')).toHaveTextContent('undefined')
    await new Promise((r) => setTimeout(r, 30))
    expect(called).toBe(false)
  })
})

describe('mutations phiếu xuất', () => {
  beforeEach(() => {
    server.use(
      mswHttp.post(URL_W, () => ok(exportFormFixture())),
      mswHttp.post(`${URL_W}/xf-1/submit`, () => ok(exportFormFixture({ status: 'PENDING' }))),
    )
  })

  it('mặc định báo thành công', async () => {
    const { user } = renderWithProviders(<MutationProbe />, { route: '/' })
    await user.click(screen.getByText('create'))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('success/'))
    expect(toast.success).toHaveBeenCalledTimes(1)
  })

  it('successToast=false → không toast', async () => {
    const { user } = renderWithProviders(<MutationProbe successToast={false} />, { route: '/' })
    await user.click(screen.getByText('create'))
    await user.click(screen.getByText('submit'))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('success/success'))
    expect(toast.success).not.toHaveBeenCalled()
  })
})
