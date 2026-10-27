import { screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { ExportForm } from '@/entities/export-form'
import { apiError, ok } from '@/shared/test/api'
import { confirmDialog } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { SubmitExportFormDialog } from './SubmitExportFormDialog'

// Hộp chỉ dùng slug / version / code / status.
const form = {
  slug: 'xf-1',
  version: 3,
  code: 'PX-0001',
  status: 'DRAFT',
  warehouseSlug: 'w-a',
} as ExportForm

const URL_A = 'http://localhost:8085/api/v1/warehouses/w-a/export-forms/xf-1/submit'

describe('SubmitExportFormDialog', () => {
  it('gửi duyệt → đúng endpoint + version → đóng', async () => {
    let body: unknown
    server.use(
      mswHttp.post(URL_A, async ({ request }) => {
        body = await request.text()
        return ok({ ...form, status: 'CONFIRMED' })
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <SubmitExportFormDialog warehouseSlug="w-a" form={form} onOpenChange={onOpenChange} />,
    )
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Hàng sẽ được giữ chỗ, phiếu không sửa được nữa.',
    )
    await confirmDialog(user, 'Gửi duyệt')
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(JSON.parse(body as string)).toEqual({ version: 3 })
  })

  it('409 → toast "đã bị thay đổi", đóng hộp', async () => {
    const error = vi.spyOn(toast, 'error')
    try {
      server.use(mswHttp.post(URL_A, () => apiError(409, 100800, 'conflict')))
      const onOpenChange = vi.fn()
      const { user } = renderWithProviders(
        <SubmitExportFormDialog warehouseSlug="w-a" form={form} onOpenChange={onOpenChange} />,
      )
      await confirmDialog(user, 'Gửi duyệt')
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
      expect(error).toHaveBeenCalledWith(
        'Phiếu vừa bị người khác thay đổi — đã tải lại bản mới nhất.',
      )
    } finally {
      error.mockRestore()
    }
  })

  it.each([
    [100817, 'inventory'],
    [101502, 'batch'],
  ])('thiếu hàng %s (%s) → toast riêng, invalidate tồn + lô, đóng hộp', async (code) => {
    const error = vi.spyOn(toast, 'error')
    try {
      server.use(mswHttp.post(URL_A, () => apiError(409, code, 'insufficient')))
      const onOpenChange = vi.fn()
      const { user, queryClient } = renderWithProviders(
        <SubmitExportFormDialog warehouseSlug="w-a" form={form} onOpenChange={onOpenChange} />,
      )
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
      await confirmDialog(user, 'Gửi duyệt')
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
      expect(error).toHaveBeenCalledWith('Không đủ hàng để gửi duyệt', expect.anything())
      expect(error).not.toHaveBeenCalledWith(
        'Phiếu vừa bị người khác thay đổi — đã tải lại bản mới nhất.',
      )
      const keys = invalidate.mock.calls.map((c) => c[0]?.queryKey)
      expect(keys).toContainEqual(['export-forms', 'w-a'])
      expect(keys).toContainEqual(['inventory'])
      expect(keys).toContainEqual(['material-batches', 'w-a'])
    } finally {
      error.mockRestore()
    }
  })

  it('thành công → invalidate phiếu + tồn + lô', async () => {
    server.use(mswHttp.post(URL_A, () => ok({ ...form, status: 'PENDING' })))
    const { user, queryClient } = renderWithProviders(
      <SubmitExportFormDialog warehouseSlug="w-a" form={form} onOpenChange={vi.fn()} />,
    )
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    await confirmDialog(user, 'Gửi duyệt')
    await waitFor(() => expect(invalidate).toHaveBeenCalled())
    const keys = invalidate.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toContainEqual(['inventory'])
    expect(keys).toContainEqual(['material-batches', 'w-a'])
  })
})
