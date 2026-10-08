import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { Role, User } from '@/entities/user'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { confirmDialog } from '@/shared/test/confirm'
import { renderWithProviders } from '@/shared/test/render'
import { chooseOption } from '@/shared/test/select'
import { UserFormSheet } from './UserFormSheet'

const BASE = 'http://localhost:8085/api/v1'

const ASSIGNABLE: Role[] = [
  { slug: 'r-sup', name: 'SUPERVISOR', level: 10, authorityCodes: [] },
  { slug: 'r-man', name: 'MANAGER', level: 20, authorityCodes: [] },
]

async function fillRequired(user: ReturnType<typeof renderWithProviders>['user']) {
  await user.type(screen.getByLabelText(/Số điện thoại/), '0390000001')
  await user.type(screen.getByLabelText(/^Họ/), 'Nguyễn')
  await user.type(screen.getByLabelText(/^Tên/), 'Văn A')
  await user.type(screen.getByLabelText(/^Mật khẩu/), 'matkhau1')
  await user.type(screen.getByLabelText(/Nhập lại mật khẩu/), 'matkhau1')
  await chooseOption(user, 'Vai trò', 'Quản lý')
}

describe('UserFormSheet — tạo', () => {
  it('ô vai trò chỉ có các vai trò được truyền vào (đã lọc theo cấp)', async () => {
    const { user } = renderWithProviders(
      <UserFormSheet open onOpenChange={() => {}} roles={ASSIGNABLE} />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Vai trò' }))

    const options = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(options).toEqual(['Giám sát', 'Quản lý'])
  })

  it('bấm Thêm khi trống → hiện lỗi ở mọi ô bắt buộc, không gọi API', async () => {
    let called = false
    server.use(mswHttp.post(`${BASE}/users`, () => ((called = true), ok({}))))
    const { user } = renderWithProviders(
      <UserFormSheet open onOpenChange={() => {}} roles={ASSIGNABLE} />,
    )

    await user.click(screen.getByRole('button', { name: 'Thêm người dùng' }))

    expect(await screen.findByText('Vui lòng nhập số điện thoại')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập họ')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập tên')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập mật khẩu')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng chọn vai trò')).toBeInTheDocument()
    expect(called).toBe(false)
  })

  it('gửi body không có trường tuỳ chọn trống, không có confirmPassword; xong thì đóng', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/users`, async ({ request }) => {
        body = await request.json()
        return ok({})
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <UserFormSheet open onOpenChange={onOpenChange} roles={ASSIGNABLE} />,
    )

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Thêm người dùng' }))
    await confirmDialog(user, 'Thêm')

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({
      phonenumber: '0390000001',
      lastName: 'Nguyễn',
      firstName: 'Văn A',
      password: 'matkhau1',
      roleSlug: 'r-man',
    })
  })

  it.each([
    [100401, 'Số điện thoại đã tồn tại'],
    [100104, 'Bạn chỉ được gán vai trò thấp hơn vai trò của mình'],
  ])('lỗi backend %i hiện tại ô, sheet vẫn mở', async (code, message) => {
    server.use(mswHttp.post(`${BASE}/users`, () => apiError(code === 100104 ? 403 : 422, code)))
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <UserFormSheet open onOpenChange={onOpenChange} roles={ASSIGNABLE} />,
    )

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Thêm người dùng' }))
    await confirmDialog(user, 'Thêm')

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('form hợp lệ → hỏi "Thêm người dùng mới?" kèm tóm tắt họ tên, SĐT, vai trò; Huỷ thì KHÔNG gửi', async () => {
    let called = false
    server.use(
      mswHttp.post(`${BASE}/users`, () => {
        called = true
        return ok({})
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <UserFormSheet open onOpenChange={onOpenChange} roles={ASSIGNABLE} />,
    )

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Thêm người dùng' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('heading')).toHaveTextContent('Thêm người dùng mới?')
    // Tóm tắt dạng nhãn – giá trị, mỗi thông tin một dòng — không nhồi vào một câu.
    const rows = within(dialog)
      .getAllByRole('term')
      .map((term) => [term.textContent, term.nextElementSibling?.textContent])
    expect(rows).toEqual([
      ['Họ tên', 'Nguyễn Văn A'],
      ['Số điện thoại', '0390000001'],
      ['Vai trò', 'Quản lý'],
    ])
    expect(called).toBe(false)

    await user.click(within(dialog).getByRole('button', { name: 'Huỷ' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(called).toBe(false)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('tạo lỗi tại ô (SĐT đã tồn tại) → đóng hộp xác nhận, lỗi hiện dưới ô', async () => {
    server.use(mswHttp.post(`${BASE}/users`, () => apiError(422, 100401)))
    const { user } = renderWithProviders(
      <UserFormSheet open onOpenChange={() => {}} roles={ASSIGNABLE} />,
    )

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Thêm người dùng' }))
    await confirmDialog(user, 'Thêm')

    expect(await screen.findByText('Số điện thoại đã tồn tại')).toBeVisible()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('kiểm ngay khi rời ô, không đợi bấm Thêm; gõ sửa lại thì lỗi tự mất', async () => {
    const { user } = renderWithProviders(
      <UserFormSheet open onOpenChange={() => {}} roles={ASSIGNABLE} />,
    )
    const phone = screen.getByLabelText(/Số điện thoại/)

    await user.type(phone, '123')
    // Đang gõ ô đầu tiên: chưa la lỗi.
    expect(screen.queryByText('Số điện thoại không đúng định dạng')).not.toBeInTheDocument()
    await user.tab()
    expect(await screen.findByText('Số điện thoại không đúng định dạng')).toBeInTheDocument()

    await user.clear(phone)
    await user.type(phone, '0390000001')
    expect(screen.queryByText('Số điện thoại không đúng định dạng')).not.toBeInTheDocument()
  })

  it('"Nhập lại mật khẩu" báo không khớp khi rời ô; sửa ô Mật khẩu cho khớp thì lỗi mất ngay', async () => {
    const { user } = renderWithProviders(
      <UserFormSheet open onOpenChange={() => {}} roles={ASSIGNABLE} />,
    )
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'matkhau1')
    await user.type(screen.getByLabelText(/Nhập lại mật khẩu/), 'matkhau2')
    await user.tab()
    expect(await screen.findByText('Mật khẩu nhập lại không khớp')).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/^Mật khẩu/))
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'matkhau2')

    expect(screen.queryByText('Mật khẩu nhập lại không khớp')).not.toBeInTheDocument()
  })

  it('đã gõ mà bấm Huỷ → hỏi "Bỏ thay đổi chưa lưu?"; chưa gõ gì → đóng thẳng', async () => {
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <UserFormSheet open onOpenChange={onOpenChange} roles={ASSIGNABLE} />,
    )

    // Mở xong (form.reset trong effect) chưa được tính là "đã sửa".
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    onOpenChange.mockClear()

    await user.type(screen.getByLabelText(/^Họ/), 'Nguyễn')
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Bỏ thay đổi chưa lưu?')
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('đóng rồi mở lại → form trống (không giữ dữ liệu nhập dở)', async () => {
    const { user, rerender } = renderWithProviders(
      <UserFormSheet open onOpenChange={() => {}} roles={ASSIGNABLE} />,
    )
    await user.type(screen.getByLabelText(/Số điện thoại/), '0390000001')

    rerender(<UserFormSheet open={false} onOpenChange={() => {}} roles={ASSIGNABLE} />)
    rerender(<UserFormSheet open onOpenChange={() => {}} roles={ASSIGNABLE} />)

    expect(screen.getByLabelText(/Số điện thoại/)).toHaveValue('')
  })

  it('hai ô mật khẩu có icon mắt trong ô, bật/tắt độc lập', async () => {
    const { user } = renderWithProviders(
      <UserFormSheet open onOpenChange={() => {}} roles={ASSIGNABLE} />,
    )
    const toggles = screen.getAllByRole('button', { name: 'Hiện mật khẩu' })
    expect(toggles).toHaveLength(2)

    await user.click(toggles[0])

    expect(screen.getByLabelText(/^Mật khẩu/)).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText(/Nhập lại mật khẩu/)).toHaveAttribute('type', 'password')
  })
})

describe('UserFormSheet — sửa', () => {
  const editing: User = {
    slug: 'u-root-like',
    createdAt: '',
    updatedAt: '',
    phonenumber: 'root',
    firstName: 'A',
    lastName: 'Nguyễn',
    dob: null,
    email: 'a@b.vn',
    address: null,
    isActive: true,
    roleSlug: 'r-sup',
    roleName: 'SUPERVISOR',
  }

  it('SĐT sửa được; không có ô mật khẩu, không có ô vai trò; ô tuỳ chọn có gợi ý "để trống = giữ nguyên"', () => {
    renderWithProviders(
      <UserFormSheet open onOpenChange={() => {}} roles={ASSIGNABLE} user={editing} />,
    )

    expect(screen.getByLabelText(/Số điện thoại/)).not.toHaveAttribute('readonly')
    expect(screen.queryByLabelText(/^Mật khẩu/)).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Vai trò' })).not.toBeInTheDocument()
    expect(screen.getAllByText('Để trống sẽ giữ nguyên giá trị hiện tại').length).toBeGreaterThan(0)
  })

  it('PATCH chỉ gửi trường đã đổi; xoá trống email thì bỏ qua (không gửi null)', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${BASE}/users/u-root-like`, async ({ request }) => {
        body = await request.json()
        return ok(editing)
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <UserFormSheet open onOpenChange={onOpenChange} roles={ASSIGNABLE} user={editing} />,
    )

    await user.clear(screen.getByLabelText(/^Tên/))
    await user.type(screen.getByLabelText(/^Tên/), 'Bình')
    await user.clear(screen.getByLabelText(/Email/))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({ firstName: 'Bình' })
  })

  it('chỉ xoá trống trường tuỳ chọn (không còn gì để gửi) → đóng sheet, KHÔNG gọi API', async () => {
    let called = false
    server.use(
      mswHttp.patch(`${BASE}/users/u-root-like`, () => {
        called = true
        return ok(editing)
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <UserFormSheet open onOpenChange={onOpenChange} roles={ASSIGNABLE} user={editing} />,
    )

    await user.clear(screen.getByLabelText(/Email/))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(called).toBe(false)
  })
})
