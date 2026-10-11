import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { mutationToastQueryClient } from '@/shared/test/query-client'
import { renderWithProviders } from '@/shared/test/render'
import { roleKeys, type Role } from '@/entities/user'
import { DeleteRoleDialog } from '../index'

const BASE = 'http://localhost:8085/api/v1'
const tl: Role = { slug: 'r-tl', name: 'Trưởng nhóm', level: 15, authorityCodes: [] }
const other: Role = { slug: 'r-tk', name: 'Thủ kho', level: 12, authorityCodes: [] }

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

function setup(canViewUsers = true) {
  const onOpenChange = vi.fn()
  const queryClient = mutationToastQueryClient()
  const view = renderWithProviders(
    <DeleteRoleDialog role={tl} onOpenChange={onOpenChange} canViewUsers={canViewUsers} />,
    { queryClient },
  )
  const rerender = (next: Role | null) =>
    view.rerender(
      <DeleteRoleDialog role={next} onOpenChange={onOpenChange} canViewUsers={canViewUsers} />,
    )
  return { ...view, onOpenChange, queryClient, rerender }
}

describe('DeleteRoleDialog', () => {
  it('xác nhận → DELETE, đóng, toast thành công', async () => {
    server.use(mswHttp.delete(`${BASE}/roles/r-tl`, () => ok('r-tl')))
    const { user, onOpenChange } = setup()

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Trưởng nhóm')
    await user.click(screen.getByRole('button', { name: 'Xoá' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(toast.success).toHaveBeenCalledWith('Đã xoá vai trò')
  })

  it('100106 → hộp giữ mở, báo trong hộp + link người dùng của vai trò (có USER_READ), không toast', async () => {
    server.use(mswHttp.delete(`${BASE}/roles/r-tl`, () => apiError(422, 100106)))
    const { user, onOpenChange } = setup(true)

    await user.click(screen.getByRole('button', { name: 'Xoá' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Vai trò còn người dùng')
    expect(screen.getByRole('link', { name: 'Xem người dùng của vai trò này' })).toHaveAttribute(
      'href',
      '/users?roleSlug=r-tl',
    )
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('100106 không có USER_READ → báo trong hộp, không có link', async () => {
    server.use(mswHttp.delete(`${BASE}/roles/r-tl`, () => apiError(422, 100106)))
    const { user } = setup(false)

    await user.click(screen.getByRole('button', { name: 'Xoá' }))

    await screen.findByRole('alert')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('100105 → báo trong hộp; đóng rồi mở lại, hoặc mở cho vai trò khác, không còn lỗi cũ', async () => {
    server.use(mswHttp.delete(`${BASE}/roles/r-tl`, () => apiError(422, 100105)))
    const { user, rerender } = setup()

    await user.click(screen.getByRole('button', { name: 'Xoá' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Vai trò có sẵn không xoá được')

    rerender(other)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    rerender(null)
    rerender(tl)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('100104 (quyền / cấp đã đổi) → toast, tải lại danh sách vai trò, đóng hộp', async () => {
    server.use(mswHttp.delete(`${BASE}/roles/r-tl`, () => apiError(403, 100104)))
    const { user, onOpenChange, queryClient } = setup()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(screen.getByRole('button', { name: 'Xoá' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: roleKeys.all })
  })
})
