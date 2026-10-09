import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { mutationToastQueryClient } from '@/shared/test/query-client'
import { renderWithProviders } from '@/shared/test/render'
import { materialKeys } from '@/entities/material'
import { supplierKeys, type SupplierMaterial } from '@/entities/supplier'
import { DetachSupplierMaterialDialog } from '../index'

const BASE = 'http://localhost:8085/api/v1'
const supplier = { slug: 's-1', code: 'NCC-HN-01' }
const material: SupplierMaterial = {
  slug: 'm-1',
  createdAt: '',
  updatedAt: '',
  code: 'NL04',
  name: 'Bột giặt',
}

function renderDialog(
  target: SupplierMaterial | null = material,
  queryClient?: ReturnType<typeof mutationToastQueryClient>,
) {
  const onOpenChange = vi.fn()
  return {
    onOpenChange,
    ...renderWithProviders(
      <DetachSupplierMaterialDialog
        supplier={supplier}
        material={target}
        onOpenChange={onOpenChange}
      />,
      { auth: 'admin', queryClient },
    ),
  }
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
})

describe('DetachSupplierMaterialDialog', () => {
  it('101213 (đã không còn gắn) → tải lại vật tư NCC, đóng hộp, toast toàn cục báo lỗi', async () => {
    server.use(mswHttp.delete(`${BASE}/suppliers/s-1/materials/m-1`, () => apiError(422, 101213)))
    const { user, queryClient, onOpenChange } = renderDialog(material, mutationToastQueryClient())
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(screen.getByRole('button', { name: 'Gỡ' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: supplierKeys.materials('s-1') })
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  it('hiện tiêu đề, mã vật tư, mã NCC và lưu ý lịch sử giao dịch', () => {
    renderDialog()
    const dialog = screen.getByRole('alertdialog', { name: 'Gỡ vật tư?' })
    expect(dialog).toHaveTextContent('NL04')
    expect(dialog).toHaveTextContent('NCC-HN-01')
    expect(dialog).toHaveTextContent(
      'Lịch sử giao dịch giữ nguyên; sau khi gỡ không ghi được giao dịch mua/trả mới cho vật tư này.',
    )
  })

  it('bấm Gỡ → DELETE, đóng hộp, tải lại vật tư NCC và vật tư toàn kho', async () => {
    let path = ''
    server.use(
      mswHttp.delete(`${BASE}/suppliers/s-1/materials/m-1`, ({ request }) => {
        path = new URL(request.url).pathname
        return ok({})
      }),
    )
    const { user, queryClient, onOpenChange } = renderDialog()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(screen.getByRole('button', { name: 'Gỡ' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(path).toBe('/api/v1/suppliers/s-1/materials/m-1')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: supplierKeys.materials('s-1') })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: materialKeys.all })
  })

  it('lỗi → toast toàn cục đúng 1 lần, hộp vẫn mở, không tải lại vật tư toàn kho', async () => {
    server.use(mswHttp.delete(`${BASE}/suppliers/s-1/materials/m-1`, () => apiError(500)))
    const { user, queryClient, onOpenChange } = renderDialog(material, mutationToastQueryClient())
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(screen.getByRole('button', { name: 'Gỡ' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gỡ' })).toBeEnabled())
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: materialKeys.all })
  })
})
