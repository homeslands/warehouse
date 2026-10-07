import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import type { Role, User } from '@/entities/user'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { chooseOption } from '@/shared/test/select'
import { ChangeUserRoleDialog } from './ChangeUserRoleDialog'

const BASE = 'http://localhost:8085/api/v1'
const ASSIGNABLE: Role[] = [
  { slug: 'r-sup', name: 'SUPERVISOR', level: 10, authorityCodes: [] },
  { slug: 'r-man', name: 'MANAGER', level: 20, authorityCodes: [] },
]
const lan: User = {
  slug: 'u-lan',
  createdAt: '',
  updatedAt: '',
  phonenumber: '0384940599',
  firstName: 'Lan',
  lastName: 'Trần',
  isActive: true,
  roleSlug: 'r-sup',
  roleName: 'SUPERVISOR',
}
const CONFIRM_LABEL = 'Nhập 0384940599 để xác nhận'

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
})

describe('ChangeUserRoleDialog', () => {
  it('nêu vai trò hiện tại và cảnh báo bị đăng xuất; ô chọn không có vai trò hiện tại', async () => {
    const { user } = renderWithProviders(
      <ChangeUserRoleDialog user={lan} roles={ASSIGNABLE} onOpenChange={() => {}} />,
    )

    expect(screen.getByText(/đăng xuất khỏi mọi thiết bị/)).toHaveTextContent('Trần Lan')
    expect(screen.getByText(/đăng xuất khỏi mọi thiết bị/)).toHaveTextContent('Giám sát')

    await user.click(screen.getByRole('combobox', { name: 'Vai trò mới' }))
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(options).toEqual(['Quản lý'])
  })

  it('chưa chọn vai trò hoặc chưa gõ đúng tên đăng nhập → nút Đổi vai trò khoá', async () => {
    const { user } = renderWithProviders(
      <ChangeUserRoleDialog user={lan} roles={ASSIGNABLE} onOpenChange={() => {}} />,
    )
    const submit = screen.getByRole('button', { name: 'Đổi vai trò' })

    expect(submit).toBeDisabled()
    await chooseOption(user, 'Vai trò mới', 'Quản lý')
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText(CONFIRM_LABEL), lan.phonenumber)
    expect(submit).toBeEnabled()
  })

  it('đủ điều kiện → POST change-role đúng slug + roleSlug, đóng dialog', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/users/u-lan/change-role`, async ({ request }) => {
        body = await request.json()
        return ok({ ...lan, roleSlug: 'r-man', roleName: 'MANAGER' })
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <ChangeUserRoleDialog user={lan} roles={ASSIGNABLE} onOpenChange={onOpenChange} />,
    )

    await chooseOption(user, 'Vai trò mới', 'Quản lý')
    await user.type(screen.getByLabelText(CONFIRM_LABEL), lan.phonenumber)
    await user.click(screen.getByRole('button', { name: 'Đổi vai trò' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({ roleSlug: 'r-man' })
  })

  it.each([
    [100104, 'Bạn chỉ được gán vai trò thấp hơn vai trò của mình'],
    [100417, 'Quản trị viên không thể sửa, khoá hay đổi vai trò của quản trị viên khác'],
  ])('lỗi %i hiện ngay trong hộp, không toast, hộp vẫn mở', async (code, message) => {
    server.use(mswHttp.post(`${BASE}/users/u-lan/change-role`, () => apiError(403, code)))
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <ChangeUserRoleDialog user={lan} roles={ASSIGNABLE} onOpenChange={onOpenChange} />,
    )

    await chooseOption(user, 'Vai trò mới', 'Quản lý')
    await user.type(screen.getByLabelText(CONFIRM_LABEL), lan.phonenumber)
    await user.click(screen.getByRole('button', { name: 'Đổi vai trò' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(toast.error).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('đóng rồi mở lại → bỏ lựa chọn cũ và chữ đã gõ', async () => {
    function Host() {
      const [current, setCurrent] = useState<User | null>(lan)
      return (
        <>
          <button onClick={() => setCurrent(lan)}>Mở lại</button>
          <ChangeUserRoleDialog
            user={current}
            roles={ASSIGNABLE}
            onOpenChange={(open) => !open && setCurrent(null)}
          />
        </>
      )
    }
    const { user } = renderWithProviders(<Host />)

    await chooseOption(user, 'Vai trò mới', 'Quản lý')
    await user.type(screen.getByLabelText(CONFIRM_LABEL), lan.phonenumber)
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))
    await user.click(screen.getByRole('button', { name: 'Mở lại' }))

    expect(screen.getByLabelText(CONFIRM_LABEL)).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Đổi vai trò' })).toBeDisabled()
  })
})
