import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { mutationToastQueryClient } from '@/shared/test/query-client'
import { renderWithProviders } from '@/shared/test/render'
import { importFormKeys } from '@/entities/import-form'
import { inventoryKeys } from '@/entities/inventory'
import { materialKeys } from '@/entities/material'
import { RemoveWarehouseMaterialDialog } from '../index'

const BASE = 'http://localhost:8085/api/v1'
const matcha = { materialSlug: 'm-1', materialCode: 'NL04', materialName: 'Matcha' }
const URL_DELETE = `${BASE}/warehouses/w-a/materials/m-1`

function renderDialog() {
  const onOpenChange = vi.fn()
  const onRemoved = vi.fn()
  const r = renderWithProviders(
    <RemoveWarehouseMaterialDialog
      warehouse={{ slug: 'w-a', name: 'Kho A' }}
      item={matcha}
      onOpenChange={onOpenChange}
      onRemoved={onRemoved}
    />,
    { auth: 'admin', queryClient: mutationToastQueryClient() },
  )
  return { ...r, onOpenChange, onRemoved }
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.info).mockClear()
})

describe('RemoveWarehouseMaterialDialog', () => {
  it('tiêu đề nêu vật tư, mô tả nêu kho', () => {
    renderDialog()
    expect(screen.getByText('Gỡ NL04 · Matcha khỏi kho?')).toBeInTheDocument()
    expect(
      screen.getByText('Vật tư vẫn còn trong danh mục, chỉ không còn thuộc kho Kho A.'),
    ).toBeInTheDocument()
  })

  it('Gỡ → DELETE, toast, invalidate tồn + danh mục, onRemoved, đóng', async () => {
    server.use(mswHttp.delete(URL_DELETE, () => ok({})))
    const { user, queryClient, onOpenChange, onRemoved } = renderDialog()
    const inv = vi.spyOn(queryClient, 'invalidateQueries')
    await user.click(screen.getByRole('button', { name: 'Gỡ' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(toast.success).toHaveBeenCalledWith('Đã gỡ NL04 · Matcha khỏi kho')
    expect(onRemoved).toHaveBeenCalledWith('m-1')
    expect(inv).toHaveBeenCalledWith({ queryKey: inventoryKeys.warehouse('w-a') })
    expect(inv).toHaveBeenCalledWith({ queryKey: materialKeys.all })
    expect(inv).toHaveBeenCalledWith({ queryKey: importFormKeys.available('w-a') })
  })

  it('100801 (đã bị gỡ) → coi như xong: toast thông tin, onRemoved, đóng, không toast lỗi', async () => {
    server.use(mswHttp.delete(URL_DELETE, () => apiError(404, 100801)))
    const { user, queryClient, onOpenChange, onRemoved } = renderDialog()
    const inv = vi.spyOn(queryClient, 'invalidateQueries')
    await user.click(screen.getByRole('button', { name: 'Gỡ' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(inv).toHaveBeenCalledWith({ queryKey: importFormKeys.available('w-a') })
    expect(inv).toHaveBeenCalledWith({ queryKey: inventoryKeys.warehouse('w-a') })
    expect(toast.info).toHaveBeenCalledWith('NL04 · Matcha đã được gỡ khỏi kho trước đó')
    expect(onRemoved).toHaveBeenCalledWith('m-1')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it.each([100807, 100813, 100804])(
    '%s → toast lỗi một lần, đóng hộp, tải lại tồn, KHÔNG onRemoved',
    async (code) => {
      server.use(mswHttp.delete(URL_DELETE, () => apiError(409, code)))
      const { user, queryClient, onOpenChange, onRemoved } = renderDialog()
      const inv = vi.spyOn(queryClient, 'invalidateQueries')
      await user.click(screen.getByRole('button', { name: 'Gỡ' }))
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
      expect(toast.error).toHaveBeenCalledTimes(1)
      expect(onRemoved).not.toHaveBeenCalled()
      expect(inv).toHaveBeenCalledWith({ queryKey: inventoryKeys.warehouse('w-a') })
    },
  )
})
