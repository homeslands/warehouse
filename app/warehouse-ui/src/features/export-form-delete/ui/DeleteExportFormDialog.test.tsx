import { screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { ExportForm } from '@/entities/export-form'
import { apiError, ok } from '@/shared/test/api'
import { confirmDialog } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { DeleteExportFormDialog } from './DeleteExportFormDialog'

// Hộp chỉ dùng slug / version / code / status.
const form = {
  slug: 'xf-1',
  version: 3,
  code: 'PX-0001',
  status: 'DRAFT',
  warehouseSlug: 'w-a',
} as ExportForm

const URL_A = 'http://localhost:8085/api/v1/warehouses/w-a/export-forms/xf-1'

describe('DeleteExportFormDialog', () => {
  it('xoá → đúng endpoint → đóng', async () => {
    let body: unknown
    server.use(
      mswHttp.delete(URL_A, async ({ request }) => {
        body = await request.text()
        return ok({ ...form, status: 'CONFIRMED' })
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <DeleteExportFormDialog warehouseSlug="w-a" form={form} onOpenChange={onOpenChange} />,
    )
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Phiếu nháp bị xoá')
    await confirmDialog(user, 'Xoá')
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toBe('')
  })

  it('409 → toast "đã bị thay đổi", đóng hộp', async () => {
    const error = vi.spyOn(toast, 'error')
    try {
      server.use(mswHttp.delete(URL_A, () => apiError(409, 100800, 'conflict')))
      const onOpenChange = vi.fn()
      const { user } = renderWithProviders(
        <DeleteExportFormDialog warehouseSlug="w-a" form={form} onOpenChange={onOpenChange} />,
      )
      await confirmDialog(user, 'Xoá')
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
      expect(error).toHaveBeenCalledWith(
        'Phiếu vừa bị người khác thay đổi — đã tải lại bản mới nhất.',
      )
    } finally {
      error.mockRestore()
    }
  })

  it('xoá từ trang chi tiết → gọi onDeleted', async () => {
    server.use(mswHttp.delete(URL_A, () => ok('xf-1')))
    const onDeleted = vi.fn()
    const { user } = renderWithProviders(
      <DeleteExportFormDialog
        warehouseSlug="w-a"
        form={form}
        onOpenChange={vi.fn()}
        onDeleted={onDeleted}
      />,
    )
    await confirmDialog(user, 'Xoá')
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
  })
})
