import { screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { ExportForm } from '@/entities/export-form'
import { apiError, ok } from '@/shared/test/api'
import { confirmDialog } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { CancelExportFormDialog } from './CancelExportFormDialog'

// Hộp chỉ dùng slug / version / code / status.
const form = {
  slug: 'xf-1',
  version: 3,
  code: 'PX-0001',
  status: 'PENDING',
  warehouseSlug: 'w-a',
} as ExportForm

const URL_A = 'http://localhost:8085/api/v1/warehouses/w-a/export-forms/xf-1/cancel'

describe('CancelExportFormDialog', () => {
  it('huỷ → đúng endpoint + version → đóng', async () => {
    let body: unknown
    server.use(
      mswHttp.post(URL_A, async ({ request }) => {
        body = await request.text()
        return ok({ ...form, status: 'CONFIRMED' })
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <CancelExportFormDialog warehouseSlug="w-a" form={form} onOpenChange={onOpenChange} />,
    )
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Hàng đang giữ chỗ sẽ được trả lại.')
    await confirmDialog(user, 'Huỷ phiếu')
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(JSON.parse(body as string)).toEqual({ version: 3 })
  })

  it('409 → toast "đã bị thay đổi", đóng hộp', async () => {
    const error = vi.spyOn(toast, 'error')
    try {
      server.use(mswHttp.post(URL_A, () => apiError(409, 100800, 'conflict')))
      const onOpenChange = vi.fn()
      const { user } = renderWithProviders(
        <CancelExportFormDialog warehouseSlug="w-a" form={form} onOpenChange={onOpenChange} />,
      )
      await confirmDialog(user, 'Huỷ phiếu')
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
      expect(error).toHaveBeenCalledWith(
        'Phiếu vừa bị người khác thay đổi — đã tải lại bản mới nhất.',
      )
    } finally {
      error.mockRestore()
    }
  })

  it('phiếu nháp → câu mô tả khác (tồn không đổi)', () => {
    renderWithProviders(
      <CancelExportFormDialog
        warehouseSlug="w-a"
        form={{ ...form, status: 'DRAFT' }}
        onOpenChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('alertdialog')).toHaveTextContent('tồn kho không đổi')
  })

  it('101438 (không huỷ được nữa) xử lý như phiếu cũ: toast + đóng', async () => {
    const error = vi.spyOn(toast, 'error')
    try {
      server.use(mswHttp.post(URL_A, () => apiError(409, 101438, 'cannot cancel')))
      const onOpenChange = vi.fn()
      const { user } = renderWithProviders(
        <CancelExportFormDialog warehouseSlug="w-a" form={form} onOpenChange={onOpenChange} />,
      )
      await confirmDialog(user, 'Huỷ phiếu')
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
      expect(error).toHaveBeenCalledWith(
        'Phiếu vừa bị người khác thay đổi — đã tải lại bản mới nhất.',
      )
    } finally {
      error.mockRestore()
    }
  })
})
