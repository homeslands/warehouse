import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { userKeys, type Role, type User } from '@/entities/user'
import { apiError, ok } from '@/shared/test/api'
import { confirmStep } from '@/shared/test/confirm'
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
    await confirmStep(user, 'Xác nhận đổi vai trò')

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
    await confirmStep(user, 'Xác nhận đổi vai trò')

    // Lỗi thuộc ô → về màn nhập, lỗi tại ô, lựa chọn cũ còn.
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('combobox', { name: 'Vai trò mới' })).toHaveTextContent('Quản lý')
    expect(screen.getByLabelText(CONFIRM_LABEL)).toHaveValue(lan.phonenumber)
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

  it('hợp lệ → hỏi "Đổi vai trò của … từ … sang …?" (tên vai trò đã dịch), chưa gửi request', async () => {
    const called = vi.fn()
    server.use(
      mswHttp.post(`${BASE}/users/u-lan/change-role`, () => {
        called()
        return ok(lan)
      }),
    )
    const { user } = renderWithProviders(
      <ChangeUserRoleDialog user={lan} roles={ASSIGNABLE} onOpenChange={() => {}} />,
    )

    await chooseOption(user, 'Vai trò mới', 'Quản lý')
    await user.type(screen.getByLabelText(CONFIRM_LABEL), lan.phonenumber)
    await user.click(screen.getByRole('button', { name: 'Đổi vai trò' }))

    expect(
      await screen.findByRole('dialog', {
        name: 'Đổi vai trò của Trần Lan từ Giám sát sang Quản lý?',
      }),
    ).toBeInTheDocument()
    expect(called).not.toHaveBeenCalled()
  })

  it('"Quay lại" giữ vai trò đã chọn và tên đăng nhập đã gõ; bấm lại thì hỏi lại', async () => {
    const { user } = renderWithProviders(
      <ChangeUserRoleDialog user={lan} roles={ASSIGNABLE} onOpenChange={() => {}} />,
    )
    await chooseOption(user, 'Vai trò mới', 'Quản lý')
    await user.type(screen.getByLabelText(CONFIRM_LABEL), lan.phonenumber)
    await user.click(screen.getByRole('button', { name: 'Đổi vai trò' }))
    await screen.findByRole('dialog', { name: /^Đổi vai trò của Trần Lan/ })

    await user.click(screen.getByRole('button', { name: 'Quay lại' }))

    expect(screen.getByRole('combobox', { name: 'Vai trò mới' })).toHaveTextContent('Quản lý')
    expect(screen.getByLabelText(CONFIRM_LABEL)).toHaveValue(lan.phonenumber)
    await user.click(screen.getByRole('button', { name: 'Đổi vai trò' }))
    expect(
      await screen.findByRole('dialog', { name: /^Đổi vai trò của Trần Lan/ }),
    ).toBeInTheDocument()
  })

  it('bấm đúp nút xác nhận chỉ gửi một request', async () => {
    const called = vi.fn()
    server.use(
      mswHttp.post(`${BASE}/users/u-lan/change-role`, async () => {
        called()
        await new Promise((resolve) => setTimeout(resolve, 150))
        return ok(lan)
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <ChangeUserRoleDialog user={lan} roles={ASSIGNABLE} onOpenChange={onOpenChange} />,
    )
    await chooseOption(user, 'Vai trò mới', 'Quản lý')
    await user.type(screen.getByLabelText(CONFIRM_LABEL), lan.phonenumber)
    await user.click(screen.getByRole('button', { name: 'Đổi vai trò' }))

    await user.dblClick(await screen.findByRole('button', { name: 'Xác nhận đổi vai trò' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(called).toHaveBeenCalledTimes(1)
  })

  it('lỗi 500 sau xác nhận → toast, ở lại màn xác nhận, xác nhận lần nữa gửi lại', async () => {
    let calls = 0
    server.use(
      mswHttp.post(`${BASE}/users/u-lan/change-role`, () => {
        calls++
        return apiError(500)
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <ChangeUserRoleDialog user={lan} roles={ASSIGNABLE} onOpenChange={onOpenChange} />,
    )
    await chooseOption(user, 'Vai trò mới', 'Quản lý')
    await user.type(screen.getByLabelText(CONFIRM_LABEL), lan.phonenumber)
    await user.click(screen.getByRole('button', { name: 'Đổi vai trò' }))
    await confirmStep(user, 'Xác nhận đổi vai trò')

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByRole('dialog', { name: /^Đổi vai trò của Trần Lan/ })).toBeInTheDocument()

    await confirmStep(user, 'Xác nhận đổi vai trò')
    await waitFor(() => expect(calls).toBe(2))
  })

  it.each([404, 409])(
    'lỗi %i (người đích mất / dữ liệu cũ) → toast, đóng hộp, làm mới danh sách người dùng',
    async (status) => {
      server.use(mswHttp.post(`${BASE}/users/u-lan/change-role`, () => apiError(status, 100405)))
      const onOpenChange = vi.fn()
      const { user, queryClient } = renderWithProviders(
        <ChangeUserRoleDialog user={lan} roles={ASSIGNABLE} onOpenChange={onOpenChange} />,
      )
      const spy = vi.spyOn(queryClient, 'invalidateQueries')
      await chooseOption(user, 'Vai trò mới', 'Quản lý')
      await user.type(screen.getByLabelText(CONFIRM_LABEL), lan.phonenumber)
      await user.click(screen.getByRole('button', { name: 'Đổi vai trò' }))
      await confirmStep(user, 'Xác nhận đổi vai trò')

      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
      expect(toast.error).toHaveBeenCalled()
      expect(spy).toHaveBeenCalledWith({ queryKey: userKeys.all })
    },
  )
})
