import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok } from '@/shared/test/api'
import { confirmDialog } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithProviders, type TestAuth } from '@/shared/test/render'
import type { Role } from '@/entities/user'
import { RoleFormSheet } from '../index'

const BASE = 'http://localhost:8085/api/v1'
const roles: Role[] = [
  { slug: 'super_admin', name: 'SUPER_ADMIN', level: 100, authorityCodes: [] },
  { slug: 'admin', name: 'ADMIN', level: 30, authorityCodes: [] },
  { slug: 'manager', name: 'MANAGER', level: 20, authorityCodes: [] },
  { slug: 'supervisor', name: 'SUPERVISOR', level: 10, authorityCodes: [] },
]
const tl: Role = {
  slug: 'tl',
  name: 'Trưởng nhóm',
  level: 15,
  description: 'cũ',
  authorityCodes: [],
}
const ADMIN: TestAuth = {
  userName: 'a',
  roleName: 'ADMIN',
  scope: ['ROLE_READ', 'ROLE_CREATE', 'ROLE_UPDATE'],
  role: { slug: 'admin', name: 'ADMIN', level: 30 },
}

function renderSheet(target?: Role, open = true) {
  const onOpenChange = vi.fn()
  const view = renderWithProviders(
    <RoleFormSheet open={open} onOpenChange={onOpenChange} role={target} roles={roles} />,
    { auth: ADMIN },
  )
  const rerender = (nextOpen: boolean, next?: Role) =>
    view.rerender(
      <RoleFormSheet open={nextOpen} onOpenChange={onOpenChange} role={next} roles={roles} />,
    )
  return { ...view, onOpenChange, rerender }
}

const nameField = () => screen.getByLabelText(/^Tên/)
const levelField = () => screen.getByLabelText(/^Cấp/)
const descriptionField = () => screen.getByLabelText(/^Mô tả/)

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

describe('RoleFormSheet — tạo', () => {
  it('gợi ý cấp đang có (thấp → cao) + khoảng tạo được; xác nhận ghi vị trí; POST body đã trim', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/roles`, async ({ request }) => {
        body = await request.json()
        return ok(tl)
      }),
    )
    const { user, onOpenChange } = renderSheet()

    expect(
      screen.getByText(
        /Đang có: Giám sát 10 · Quản lý 20 · Quản trị viên 30 · Quản trị cấp cao 100/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/Bạn tạo được cấp 1–29/)).toBeInTheDocument()
    // Tên vai trò dài không khoảng trắng trong gợi ý không được kéo tràn sheet (break-ui 375px).
    expect(screen.getByText(/Bạn tạo được cấp 1–29/)).toHaveClass('wrap-anywhere')

    await user.type(nameField(), '  Trưởng nhóm ')
    await user.type(levelField(), '15')
    await user.click(screen.getByRole('button', { name: 'Thêm vai trò' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('trên Giám sát, dưới Quản lý')
    await confirmDialog(user, 'Thêm')

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({ name: 'Trưởng nhóm', level: 15 })
    expect(toast.success).toHaveBeenCalledWith('Đã thêm vai trò')
  })

  it('trùng tên vai trò có sẵn ("  admin ", "quản lý") bị chặn tại ô; cấp 30 vượt trần; không gửi', async () => {
    const posted = vi.fn()
    server.use(
      mswHttp.post(`${BASE}/roles`, () => {
        posted()
        return ok(tl)
      }),
    )
    const { user } = renderSheet()

    await user.type(nameField(), '  admin ')
    await user.type(levelField(), '30')
    await user.click(screen.getByRole('button', { name: 'Thêm vai trò' }))

    expect(await screen.findByText('Trùng tên một vai trò đang có')).toBeInTheDocument()
    expect(screen.getByText(/Cấp vượt mức bạn được tạo/)).toBeInTheDocument()

    await user.clear(nameField())
    await user.type(nameField(), 'quản lý')
    await user.tab()
    expect(await screen.findByText('Trùng tên một vai trò đang có')).toBeInTheDocument()
    expect(posted).not.toHaveBeenCalled()
  })

  it('100102 (tên của vai trò đã xoá) → lỗi tại ô Tên; 100104 → lỗi tại ô Cấp; không toast lỗi', async () => {
    server.use(mswHttp.post(`${BASE}/roles`, () => apiError(409, 100102)))
    const { user } = renderSheet()

    await user.type(nameField(), 'Đã xoá')
    await user.type(levelField(), '5')
    await user.click(screen.getByRole('button', { name: 'Thêm vai trò' }))
    await confirmDialog(user, 'Thêm')
    expect(
      await screen.findByText('Tên vai trò đã tồn tại (kể cả vai trò đã xoá)'),
    ).toBeInTheDocument()

    server.use(mswHttp.post(`${BASE}/roles`, () => apiError(403, 100104)))
    await user.clear(nameField())
    await user.type(nameField(), 'Khác')
    await user.click(screen.getByRole('button', { name: 'Thêm vai trò' }))
    await confirmDialog(user, 'Thêm')
    expect(await screen.findByText('Cấp phải thấp hơn cấp của bạn')).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('đóng rồi mở lại: form trống, không còn lỗi cũ', async () => {
    const { user, rerender } = renderSheet()
    await user.type(nameField(), 'admin')
    await user.tab()
    expect(await screen.findByText('Trùng tên một vai trò đang có')).toBeInTheDocument()

    rerender(false)
    rerender(true)
    await waitFor(() => expect(nameField()).toHaveValue(''))
    expect(screen.queryByText('Trùng tên một vai trò đang có')).not.toBeInTheDocument()
  })
})

describe('RoleFormSheet — SUPER_ADMIN', () => {
  it('trần cấp 99 (dưới SUPER_ADMIN): gợi ý ghi khoảng, cấp 100 bị chặn tại ô, không gửi', async () => {
    const posted = vi.fn()
    server.use(
      mswHttp.post(`${BASE}/roles`, () => {
        posted()
        return ok(tl)
      }),
    )
    const { user } = renderWithProviders(
      <RoleFormSheet open onOpenChange={vi.fn()} roles={roles} />,
      { auth: 'admin' },
    )

    expect(screen.getByText(/Bạn tạo được cấp 1–99/)).toBeInTheDocument()
    await user.type(nameField(), 'Giám đốc vùng')
    await user.type(levelField(), '100')
    await user.click(screen.getByRole('button', { name: 'Thêm vai trò' }))

    expect(await screen.findByText(/Cấp vượt mức bạn được tạo/)).toBeInTheDocument()
    expect(posted).not.toHaveBeenCalled()
  })
})

describe('RoleFormSheet — sửa', () => {
  it('Tên + Cấp chỉ đọc; chưa đổi khoá Lưu; xoá trống mô tả → PATCH { description: "" }', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${BASE}/roles/tl`, async ({ request }) => {
        body = await request.json()
        return ok(tl)
      }),
    )
    const { user, onOpenChange } = renderSheet(tl)

    expect(screen.queryByLabelText(/^Tên/)).not.toBeInTheDocument()
    expect(screen.getByText('Trưởng nhóm')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    await waitFor(() => expect(descriptionField()).toHaveValue('cũ'))
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()

    await user.clear(descriptionField())
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('heading')).toHaveTextContent(
      'Lưu thay đổi vai trò Trưởng nhóm?',
    )
    expect(within(dialog).getByText('Đã sửa: Mô tả')).toBeInTheDocument()
    expect(body).toBeUndefined()
    await confirmDialog(user, 'Lưu thay đổi')

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({ description: '' })
    expect(toast.success).toHaveBeenCalledWith('Đã lưu vai trò')
  })

  it('Quay lại trong hộp xác nhận → không PATCH, sheet còn mở', async () => {
    let calls = 0
    server.use(
      mswHttp.patch(`${BASE}/roles/tl`, () => {
        calls += 1
        return ok(tl)
      }),
    )
    const { user, onOpenChange } = renderSheet(tl)
    await waitFor(() => expect(descriptionField()).toHaveValue('cũ'))

    await user.type(descriptionField(), ' hơn')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Quay lại' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(calls).toBe(0)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(descriptionField()).toHaveValue('cũ hơn')
  })
})
