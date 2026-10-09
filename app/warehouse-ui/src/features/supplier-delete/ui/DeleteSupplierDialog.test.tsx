import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { mutationToastQueryClient } from '@/shared/test/query-client'
import { renderWithProviders } from '@/shared/test/render'
import type { Supplier } from '@/entities/supplier'
import { DeleteSupplierDialog } from './DeleteSupplierDialog'

const BASE = 'http://localhost:8085/api/v1'

const supplier: Supplier = {
  slug: 's-1',
  createdAt: 'Thu Oct 08 2026 09:00:00 GMT+0700',
  updatedAt: 'Thu Oct 08 2026 09:00:00 GMT+0700',
  code: 'NCC-HN-01',
  name: 'Công ty ABC',
}
const other: Supplier = { ...supplier, slug: 's-2', code: 'NCC-HCM-02', name: 'Công ty XYZ' }

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

function setup(target: Supplier | null = supplier) {
  const onOpenChange = vi.fn()
  const onDeleted = vi.fn()
  const view = renderWithProviders(
    <DeleteSupplierDialog supplier={target} onOpenChange={onOpenChange} onDeleted={onDeleted} />,
    { queryClient: mutationToastQueryClient() },
  )
  const rerender = (next: Supplier | null) =>
    view.rerender(
      <DeleteSupplierDialog supplier={next} onOpenChange={onOpenChange} onDeleted={onDeleted} />,
    )
  return { ...view, onOpenChange, onDeleted, rerender }
}

describe('DeleteSupplierDialog', () => {
  it('xác nhận xoá → gọi DELETE, onDeleted, đóng hộp, toast thành công', async () => {
    const calls: string[] = []
    server.use(
      mswHttp.delete(`${BASE}/suppliers/s-1`, () => {
        calls.push('s-1')
        return ok('s-1')
      }),
    )
    const { user, onDeleted, onOpenChange } = setup()

    const dialog = screen.getByRole('alertdialog')
    expect(screen.getByText('Xoá nhà cung cấp?')).toBeInTheDocument()
    expect(dialog).toHaveTextContent('NCC-HN-01')
    expect(dialog).toHaveTextContent('Mã vẫn bị giữ chỗ sau khi xoá')

    await user.click(screen.getByRole('button', { name: 'Xoá' }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(calls).toEqual(['s-1'])
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(toast.success).toHaveBeenCalledWith('Đã xoá nhà cung cấp')
  })

  it('101211 → hộp vẫn mở, báo tại chỗ kèm link tab Vật tư, không toast', async () => {
    server.use(mswHttp.delete(`${BASE}/suppliers/s-1`, () => apiError(422, 101211)))
    const { user, onDeleted, onOpenChange } = setup()

    await user.click(screen.getByRole('button', { name: 'Xoá' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Nhà cung cấp còn vật tư đang gắn — gỡ hết trước khi xoá')
    expect(screen.getByRole('link', { name: 'Mở tab Vật tư' })).toHaveAttribute(
      'href',
      '/suppliers/s-1?tab=materials',
    )
    expect(toast.error).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('lỗi 500 → toast lỗi, hộp vẫn mở, không có khối lỗi tại chỗ', async () => {
    server.use(mswHttp.delete(`${BASE}/suppliers/s-1`, () => apiError(500)))
    const { user, onDeleted, onOpenChange } = setup()

    await user.click(screen.getByRole('button', { name: 'Xoá' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('mở lại cho nhà cung cấp khác → lỗi cũ biến mất', async () => {
    server.use(mswHttp.delete(`${BASE}/suppliers/s-1`, () => apiError(422, 101211)))
    const { user, rerender } = setup()

    await user.click(screen.getByRole('button', { name: 'Xoá' }))
    await screen.findByRole('alert')

    rerender(other)

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByRole('alertdialog')).toHaveTextContent('NCC-HCM-02')
  })
})
