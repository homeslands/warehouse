import { screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { ExportForm } from '@/entities/export-form'
import { apiError, ok } from '@/shared/test/api'
import { confirmDialog } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { ConfirmExportFormDialog } from './ConfirmExportFormDialog'

// Hộp chỉ dùng slug / version / code / status.
const form = {
  slug: 'xf-1',
  version: 3,
  code: 'PX-0001',
  status: 'PENDING',
  warehouseSlug: 'w-a',
} as ExportForm

const URL_A = 'http://localhost:8085/api/v1/warehouses/w-a/export-forms/xf-1/confirm'

describe('ConfirmExportFormDialog', () => {
  it('xác nhận → đúng endpoint + version → đóng', async () => {
    let body: unknown
    server.use(
      mswHttp.post(URL_A, async ({ request }) => {
        body = await request.text()
        return ok({ ...form, status: 'CONFIRMED' })
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <ConfirmExportFormDialog warehouseSlug="w-a" form={form} onOpenChange={onOpenChange} />,
    )
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Tồn kho sẽ bị trừ ngay.')
    await confirmDialog(user, 'Xác nhận')
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(JSON.parse(body as string)).toEqual({ version: 3 })
  })

  it('409 → toast "đã bị thay đổi", đóng hộp', async () => {
    const error = vi.spyOn(toast, 'error')
    try {
      server.use(mswHttp.post(URL_A, () => apiError(409, 100800, 'conflict')))
      const onOpenChange = vi.fn()
      const { user } = renderWithProviders(
        <ConfirmExportFormDialog warehouseSlug="w-a" form={form} onOpenChange={onOpenChange} />,
      )
      await confirmDialog(user, 'Xác nhận')
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
      expect(error).toHaveBeenCalledWith(
        'Phiếu vừa bị người khác thay đổi — đã tải lại bản mới nhất.',
      )
    } finally {
      error.mockRestore()
    }
  })

  it('thiếu hàng → toast lỗi, làm mới tồn + lô, hộp giữ nguyên để thử lại', async () => {
    const error = vi.spyOn(toast, 'error')
    try {
      server.use(mswHttp.post(URL_A, () => apiError(409, 100817, 'insufficient')))
      const onOpenChange = vi.fn()
      const { user, queryClient } = renderWithProviders(
        <ConfirmExportFormDialog warehouseSlug="w-a" form={form} onOpenChange={onOpenChange} />,
      )
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
      await confirmDialog(user, 'Xác nhận')
      // Chờ hệ quả quan sát được của 409 trước khi khẳng định hộp còn mở.
      await waitFor(() => expect(error).toHaveBeenCalled())
      const keys = invalidate.mock.calls.map((c) => c[0]?.queryKey)
      expect(keys).toContainEqual(['inventory'])
      expect(keys).toContainEqual(['material-batches', 'w-a'])
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      expect(onOpenChange).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
    }
  })

  it('101437 (không còn PENDING) xử lý như 409', async () => {
    server.use(mswHttp.post(URL_A, () => apiError(409, 101437, 'not pending')))
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <ConfirmExportFormDialog warehouseSlug="w-a" form={form} onOpenChange={onOpenChange} />,
    )
    await confirmDialog(user, 'Xác nhận')
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})
