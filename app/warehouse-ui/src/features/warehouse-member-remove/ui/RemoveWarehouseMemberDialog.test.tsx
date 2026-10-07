import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { userKeys } from '@/entities/user'
import { RemoveWarehouseMemberDialog } from '../index'

const BASE = 'http://localhost:8085/api/v1'
const lan = { slug: 'u-lan', phonenumber: '0384940599', firstName: 'Lan', lastName: 'Trần' }

function renderDialog(member: typeof lan | null = lan) {
  const onOpenChange = vi.fn()
  return {
    onOpenChange,
    ...renderWithProviders(
      <RemoveWarehouseMemberDialog
        warehouseSlug="kho-1"
        member={member}
        onOpenChange={onOpenChange}
      />,
      { auth: 'admin' },
    ),
  }
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
})

describe('RemoveWarehouseMemberDialog', () => {
  it('hiện tên người bị gỡ, không bắt gõ xác nhận', () => {
    renderDialog()
    expect(screen.getByText(/khỏi kho/)).toHaveTextContent('Trần Lan')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('bấm Gỡ → DELETE members/{slug}, tải lại danh sách thành viên, đóng hộp', async () => {
    let called = false
    server.use(
      mswHttp.delete(`${BASE}/warehouses/kho-1/members/u-lan`, () => {
        called = true
        return ok({})
      }),
    )
    const { user, queryClient, onOpenChange } = renderDialog()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(screen.getByRole('button', { name: 'Gỡ' }))

    await waitFor(() => expect(called).toBe(true))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: userKeys.all })
  })

  it('lỗi → không đóng hộp, không tải lại danh sách thành viên', async () => {
    server.use(mswHttp.delete(`${BASE}/warehouses/kho-1/members/u-lan`, () => apiError(500)))
    const { user, queryClient, onOpenChange } = renderDialog()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(screen.getByRole('button', { name: 'Gỡ' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Gỡ' })).toBeEnabled())
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: userKeys.all })
  })
})
