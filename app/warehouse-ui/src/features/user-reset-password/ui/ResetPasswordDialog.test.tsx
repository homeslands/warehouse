import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import type { User } from '@/entities/user'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { ResetPasswordDialog } from './ResetPasswordDialog'

const BASE = 'http://localhost:8085/api/v1'
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
const minh: User = {
  slug: 'u-minh',
  createdAt: '',
  updatedAt: '',
  phonenumber: '0390000001',
  firstName: 'Minh',
  lastName: 'Nguyễn',
  isActive: true,
  roleSlug: 'r-sup',
  roleName: 'SUPERVISOR',
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
})

const CONFIRM_LABEL = 'Nhập 0384940599 để xác nhận'

describe('ResetPasswordDialog', () => {
  it('phải gõ đúng tên đăng nhập của người bị đổi mới bấm được Đặt lại mật khẩu', async () => {
    const { user } = renderWithProviders(<ResetPasswordDialog user={lan} onOpenChange={() => {}} />)
    const submit = screen.getByRole('button', { name: 'Đặt lại mật khẩu' })

    await user.type(screen.getByLabelText(/^Mật khẩu mới/), 'matkhau1')
    await user.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), 'matkhau1')
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText(CONFIRM_LABEL), '0384940598')
    expect(submit).toBeDisabled()

    await user.clear(screen.getByLabelText(CONFIRM_LABEL))
    await user.type(screen.getByLabelText(CONFIRM_LABEL), lan.phonenumber)
    expect(submit).toBeEnabled()
  })

  it('cảnh báo mọi phiên của người đó bị đăng xuất, có tên người đó', () => {
    renderWithProviders(<ResetPasswordDialog user={lan} onOpenChange={() => {}} />)

    expect(screen.getByText(/sẽ bị đăng xuất/)).toHaveTextContent('Trần Lan')
  })

  it('mật khẩu mới dưới 8 ký tự → báo tại ô, không gọi API', async () => {
    let called = false
    server.use(
      mswHttp.post(`${BASE}/users/u-lan/change-password`, () => {
        called = true
        return ok({})
      }),
    )
    const { user } = renderWithProviders(<ResetPasswordDialog user={lan} onOpenChange={() => {}} />)

    await user.type(screen.getByLabelText(/^Mật khẩu mới/), '1234567')
    await user.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), '1234567')
    await user.type(screen.getByLabelText(CONFIRM_LABEL), lan.phonenumber)
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }))

    expect(await screen.findByText('Mật khẩu phải có ít nhất 8 ký tự')).toBeInTheDocument()
    expect(called).toBe(false)
  })

  it('nhập lại không khớp → báo tại ô, không gọi API', async () => {
    let called = false
    server.use(mswHttp.post(`${BASE}/users/u-lan/change-password`, () => ((called = true), ok({}))))
    const { user } = renderWithProviders(<ResetPasswordDialog user={lan} onOpenChange={() => {}} />)

    await user.type(screen.getByLabelText(/^Mật khẩu mới/), 'matkhau1')
    await user.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), 'matkhau2')
    await user.type(screen.getByLabelText(CONFIRM_LABEL), lan.phonenumber)
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }))

    expect(await screen.findByText('Mật khẩu nhập lại không khớp')).toBeInTheDocument()
    expect(called).toBe(false)
  })

  it('hợp lệ → POST đúng slug, chỉ gửi newPassword, đóng dialog', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/users/u-lan/change-password`, async ({ request }) => {
        body = await request.json()
        return ok({ userSlug: 'u-lan' })
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <ResetPasswordDialog user={lan} onOpenChange={onOpenChange} />,
    )

    await user.type(screen.getByLabelText(/^Mật khẩu mới/), 'matkhau1')
    await user.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), 'matkhau1')
    await user.type(screen.getByLabelText(CONFIRM_LABEL), lan.phonenumber)
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({ newPassword: 'matkhau1' })
  })

  it('403 100407 → toast lỗi tiếng Việt, dialog vẫn mở', async () => {
    server.use(mswHttp.post(`${BASE}/users/u-lan/change-password`, () => apiError(403, 100407)))
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <ResetPasswordDialog user={lan} onOpenChange={onOpenChange} />,
    )

    await user.type(screen.getByLabelText(/^Mật khẩu mới/), 'matkhau1')
    await user.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), 'matkhau1')
    await user.type(screen.getByLabelText(CONFIRM_LABEL), lan.phonenumber)
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }))

    // `toastApiError` gọi `toast.error(msg)` MỘT tham số cho lỗi có `code` (100407 không rỗng nên
    // không khớp `isPermissionDenied`, nhánh đó mới truyền thêm `{ id: 'permission-denied' }`) — đã
    // kiểm `src/shared/lib/toast-error.ts` trước khi viết assertion này.
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Bạn không có quyền đổi mật khẩu của người dùng này',
      ),
    )
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('mỗi ô có icon mắt riêng nằm trong ô; bấm icon ô nào chỉ hiện ô đó', async () => {
    const { user } = renderWithProviders(<ResetPasswordDialog user={lan} onOpenChange={() => {}} />)
    const newPassword = screen.getByLabelText(/^Mật khẩu mới/)
    const confirm = screen.getByLabelText(/Nhập lại mật khẩu mới/)
    const toggles = screen.getAllByRole('button', { name: 'Hiện mật khẩu' })

    expect(toggles).toHaveLength(2)
    expect(toggles[0].closest('[data-slot="input-group"]')).toContainElement(newPassword)

    await user.click(toggles[0])

    expect(newPassword).toHaveAttribute('type', 'text')
    expect(confirm).toHaveAttribute('type', 'password')
  })

  it('đang gửi thì không đóng được bằng Esc, và ẩn nút ×', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      mswHttp.post(`${BASE}/users/u-lan/change-password`, async () => {
        await gate
        return ok({ userSlug: 'u-lan' })
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <ResetPasswordDialog user={lan} onOpenChange={onOpenChange} />,
    )
    await user.type(screen.getByLabelText(/^Mật khẩu mới/), 'matkhau1')
    await user.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), 'matkhau1')
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeInTheDocument()

    await user.type(screen.getByLabelText(CONFIRM_LABEL), lan.phonenumber)
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }))
    await screen.findByRole('button', { name: 'Đang lưu...' })

    await user.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Đóng' })).not.toBeInTheDocument()

    release()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('404 100405 (người đích không còn) → toast lỗi và tự đóng dialog', async () => {
    server.use(mswHttp.post(`${BASE}/users/u-lan/change-password`, () => apiError(404, 100405)))
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <ResetPasswordDialog user={lan} onOpenChange={onOpenChange} />,
    )

    await user.type(screen.getByLabelText(/^Mật khẩu mới/), 'matkhau1')
    await user.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), 'matkhau1')
    await user.type(screen.getByLabelText(CONFIRM_LABEL), lan.phonenumber)
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('đóng bằng Huỷ rồi mở cho người khác → hai ô mật khẩu trống và ẩn lại (Review Focus #3)', async () => {
    function Host() {
      const [current, setCurrent] = useState<User | null>(lan)
      return (
        <>
          <button onClick={() => setCurrent(minh)}>Mở Minh</button>
          <ResetPasswordDialog user={current} onOpenChange={(open) => !open && setCurrent(null)} />
        </>
      )
    }
    const { user } = renderWithProviders(<Host />)

    await user.type(screen.getByLabelText(/^Mật khẩu mới/), 'matkhau1')
    await user.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), 'matkhau1')
    for (const toggle of screen.getAllByRole('button', { name: 'Hiện mật khẩu' })) {
      await user.click(toggle)
    }
    expect(screen.getByLabelText(/^Mật khẩu mới/)).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText(/Nhập lại mật khẩu mới/)).toHaveAttribute('type', 'text')

    await user.type(screen.getByLabelText(CONFIRM_LABEL), lan.phonenumber)
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))
    await user.click(screen.getByRole('button', { name: 'Mở Minh' }))

    expect(screen.getByLabelText(/^Mật khẩu mới/)).toHaveValue('')
    expect(screen.getByLabelText(/Nhập lại mật khẩu mới/)).toHaveValue('')
    expect(screen.getByLabelText(/^Mật khẩu mới/)).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText(/Nhập lại mật khẩu mới/)).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText(`Nhập ${minh.phonenumber} để xác nhận`)).toHaveValue('')
  })
})
