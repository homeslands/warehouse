import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { server } from '@/shared/test/msw'
import { confirmStep } from '@/shared/test/confirm'
import { renderWithProviders } from '@/shared/test/render'
import { getTokens, setTokens } from '@/shared/api/token-storage'
import { useAuthStore } from '@/entities/session'
import { ChangePasswordDialog } from './ChangePasswordDialog'

const BASE = 'http://localhost:8085/api/v1'
const user = { userName: 'root', roleName: 'SUPER_ADMIN', scope: [] }

function renderDialog() {
  const onOpenChange = vi.fn()
  renderWithProviders(<ChangePasswordDialog open onOpenChange={onOpenChange} />, { auth: user })
  return { onOpenChange }
}

async function fill(
  u: ReturnType<typeof userEvent.setup>,
  current: string,
  next: string,
  confirm: string,
) {
  // Nhãn bắt buộc thêm dấu `*` sau chữ — khớp bằng regex neo đầu chuỗi để không lẫn "Mật khẩu mới"
  // với "Nhập lại mật khẩu mới" (chuỗi sau chứa chuỗi trước).
  await u.type(screen.getByLabelText(/^Mật khẩu hiện tại/), current)
  await u.type(screen.getByLabelText(/^Mật khẩu mới/), next)
  await u.type(screen.getByLabelText(/^Nhập lại mật khẩu mới/), confirm)
  await u.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
  setTokens({ accessToken: 'acc-old', refreshToken: 'ref-old' })
})

describe('ChangePasswordDialog', () => {
  it('cả 3 ô mật khẩu có icon mắt trong ô; bấm icon ô nào chỉ hiện ô đó', async () => {
    const u = userEvent.setup()
    renderDialog()
    const toggles = screen.getAllByRole('button', { name: 'Hiện mật khẩu' })
    expect(toggles).toHaveLength(3)

    await u.click(toggles[1])

    expect(screen.getByLabelText(/^Mật khẩu hiện tại/)).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText(/^Mật khẩu mới/)).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText(/^Nhập lại mật khẩu mới/)).toHaveAttribute('type', 'password')
  })

  it('bỏ trống cả 3 ô → focus vào Mật khẩu hiện tại, không gửi request', async () => {
    let called = false
    server.use(
      mswHttp.post(`${BASE}/auth/change-password`, () => {
        called = true
        return HttpResponse.json({})
      }),
    )
    const u = userEvent.setup()
    renderDialog()

    await u.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))

    expect(await screen.findByText('Vui lòng nhập mật khẩu hiện tại')).toBeInTheDocument()
    expect(called).toBe(false)
    expect(screen.getByLabelText(/^Mật khẩu hiện tại/)).toHaveFocus()
  })

  it('nhập lại không khớp → báo tại ô, không gọi API', async () => {
    const called = vi.fn()
    server.use(
      mswHttp.post(`${BASE}/auth/change-password`, () => {
        called()
        return HttpResponse.json({})
      }),
    )
    const u = userEvent.setup()
    renderDialog()

    await fill(u, 'old', 'matkhau-1', 'matkhau-2')

    expect(await screen.findByText('Mật khẩu nhập lại không khớp')).toBeInTheDocument()
    expect(called).not.toHaveBeenCalled()
  })

  it('sai mật khẩu hiện tại (422/100013) → báo tại ô, không toast', async () => {
    server.use(
      mswHttp.post(`${BASE}/auth/change-password`, () =>
        HttpResponse.json(
          {
            statusCode: 422,
            code: 100013,
            timestamp: '',
            path: '',
            method: 'POST',
            message: 'Current password is incorrect',
          },
          { status: 422 },
        ),
      ),
    )
    const u = userEvent.setup()
    renderDialog()

    await fill(u, 'wrong', 'matkhau-moi', 'matkhau-moi')
    await confirmStep(u, 'Xác nhận đổi mật khẩu')

    // Lỗi thuộc ô → về màn nhập, lỗi tại ô, mật khẩu đã gõ vẫn còn.
    expect(await screen.findByText('Mật khẩu hiện tại không đúng')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Mật khẩu hiện tại/)).toHaveValue('wrong')
    expect(screen.getByLabelText(/^Mật khẩu mới/)).toHaveValue('matkhau-moi')
    expect(toast.error).not.toHaveBeenCalled()
    expect(getTokens()).toEqual({ accessToken: 'acc-old', refreshToken: 'ref-old' })
  })

  it('lỗi khác → toast đúng 1 lần', async () => {
    server.use(
      mswHttp.post(`${BASE}/auth/change-password`, () =>
        HttpResponse.json(
          { statusCode: 500, timestamp: '', path: '', method: 'POST', message: 'boom' },
          { status: 500 },
        ),
      ),
    )
    const u = userEvent.setup()
    renderDialog()

    await fill(u, 'old', 'matkhau-moi', 'matkhau-moi')
    await confirmStep(u, 'Xác nhận đổi mật khẩu')

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    // Lỗi khác → ở lại màn xác nhận.
    expect(screen.getByRole('dialog', { name: 'Đổi mật khẩu của bạn?' })).toBeInTheDocument()
  })

  it('thành công → thay token (giữ user), toast, đóng dialog', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/auth/change-password`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({
          message: 'ok',
          statusCode: 200,
          timestamp: '',
          result: { tokens: { accessToken: 'acc-new', refreshToken: 'ref-new' } },
        })
      }),
    )
    const u = userEvent.setup()
    const { onOpenChange } = renderDialog()

    await fill(u, 'old', 'matkhau-moi', 'matkhau-moi')
    await confirmStep(u, 'Xác nhận đổi mật khẩu')

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    // confirmNewPassword chỉ kiểm ở client, không gửi lên.
    expect(body).toEqual({ currentPassword: 'old', newPassword: 'matkhau-moi' })
    expect(getTokens()).toEqual({ accessToken: 'acc-new', refreshToken: 'ref-new' })
    expect(useAuthStore.getState()).toMatchObject({
      user,
      status: 'authenticated',
      hasSession: true,
    })
    expect(toast.success).toHaveBeenCalledWith(
      'Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.',
    )
  })

  it('hợp lệ → hỏi "Đổi mật khẩu của bạn?", chưa gửi request, không hiện mật khẩu', async () => {
    const called = vi.fn()
    server.use(
      mswHttp.post(`${BASE}/auth/change-password`, () => {
        called()
        return HttpResponse.json({})
      }),
    )
    const u = userEvent.setup()
    renderDialog()

    await fill(u, 'old-secret', 'matkhau-moi', 'matkhau-moi')

    const dialog = await screen.findByRole('dialog', { name: 'Đổi mật khẩu của bạn?' })
    expect(dialog).not.toHaveTextContent('old-secret')
    expect(dialog).not.toHaveTextContent('matkhau-moi')
    expect(screen.queryByDisplayValue('matkhau-moi')).not.toBeInTheDocument()
    expect(called).not.toHaveBeenCalled()
  })

  it('"Quay lại" giữ nguyên cả 3 ô mật khẩu; bấm lại thì hỏi lại', async () => {
    const u = userEvent.setup()
    renderDialog()
    await fill(u, 'old-secret', 'matkhau-moi', 'matkhau-moi')
    await screen.findByRole('dialog', { name: 'Đổi mật khẩu của bạn?' })

    await u.click(screen.getByRole('button', { name: 'Quay lại' }))

    expect(screen.getByLabelText(/^Mật khẩu hiện tại/)).toHaveValue('old-secret')
    expect(screen.getByLabelText(/^Mật khẩu mới/)).toHaveValue('matkhau-moi')
    expect(screen.getByLabelText(/^Nhập lại mật khẩu mới/)).toHaveValue('matkhau-moi')
    await u.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))
    expect(await screen.findByRole('dialog', { name: 'Đổi mật khẩu của bạn?' })).toBeInTheDocument()
  })

  it('bấm đúp nút xác nhận chỉ gửi một request', async () => {
    const called = vi.fn()
    server.use(
      mswHttp.post(`${BASE}/auth/change-password`, async () => {
        called()
        await new Promise((resolve) => setTimeout(resolve, 150))
        return HttpResponse.json({
          message: 'ok',
          statusCode: 200,
          timestamp: '',
          result: { tokens: { accessToken: 'acc-new', refreshToken: 'ref-new' } },
        })
      }),
    )
    const u = userEvent.setup()
    const { onOpenChange } = renderDialog()
    await fill(u, 'old', 'matkhau-moi', 'matkhau-moi')

    await u.dblClick(await screen.findByRole('button', { name: 'Xác nhận đổi mật khẩu' }))

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(called).toHaveBeenCalledTimes(1)
  })
})
