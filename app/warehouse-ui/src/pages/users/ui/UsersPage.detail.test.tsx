import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sheet chi tiết hiện nút theo đúng quyền của menu ⋯ — cần cờ sửa / khoá bật như backend hiện tại.
vi.mock('@/shared/api/backend-capabilities', () => ({
  BACKEND_SUPPORTS: {
    authorityGuards: true,
    storeAuthorityGuards: true,
    permissionDelegationRules: true,
    userUpdate: true,
    userStatus: true,
    userSearch: true,
    userSort: false,
  },
}))

import type { Role, User } from '@/entities/user'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { UsersPage } from '@/pages/users'

const BASE = 'http://localhost:8085/api/v1'
const manager: User = {
  slug: 'u-man',
  createdAt: '2026-09-30T04:22:59.000Z',
  updatedAt: '2026-10-01T04:22:59.000Z',
  phonenumber: '0340000000',
  firstName: 'Minh',
  lastName: 'Lê',
  email: null,
  dob: '1990-05-20',
  address: 'Số 1, Cầu Giấy, Hà Nội',
  isActive: true,
  roleSlug: 'r-MANAGER',
  roleName: 'MANAGER',
  warehouses: [
    { slug: 'kho-hn', code: 'HN', name: 'Kho Hà Nội' },
    { slug: 'kho-hp', code: 'HP', name: 'Kho Hải Phòng' },
  ],
}
const ROLES: Role[] = [
  { slug: 'r-MANAGER', name: 'MANAGER', level: 20, authorityCodes: [] },
  { slug: 'r-ADMIN', name: 'ADMIN', level: 30, authorityCodes: [] },
]

// Người KHÔNG nằm trong trang danh sách đang xem — chỉ tới được qua `GET /users/{slug}` (link `?user=`).
const other: User = {
  ...manager,
  slug: 'u-other',
  phonenumber: '0330000000',
  firstName: 'Hà',
  lastName: 'Trần',
  roleSlug: 'r-SUPERVISOR',
  roleName: 'SUPERVISOR',
  warehouses: [],
}

let current: User = manager
let detailHits = 0
beforeEach(() => {
  current = manager
  detailHits = 0
  server.use(
    mswHttp.get(`${BASE}/users`, () => paginated([current])),
    mswHttp.get(`${BASE}/users/:slug`, ({ params }) => {
      detailHits += 1
      if (params.slug === 'u-man') return ok(current)
      if (params.slug === 'u-other') return ok(other)
      return apiError(404, 100405, 'User not found')
    }),
    mswHttp.get(`${BASE}/roles`, () => ok(ROLES)),
  )
})

function LocationProbe() {
  return <output data-testid="location">{useLocation().search}</output>
}

function renderPage(route = '/users', auth: typeof ADMIN_FULL = ADMIN_FULL) {
  return renderWithProviders(
    <>
      <UsersPage />
      <LocationProbe />
    </>,
    { route, auth },
  )
}

const ADMIN_FULL = {
  userName: '0310000000',
  roleName: 'ADMIN',
  scope: ['USER_READ', 'USER_CREATE', 'USER_CHANGE_PASSWORD', 'ROLE_READ', 'USER_UPDATE'],
}
const VIEWER = { userName: '0350000000', roleName: 'ADMIN', scope: ['USER_READ'] }

function field(dialog: HTMLElement, label: string) {
  return within(dialog).getByText(label, { selector: 'dt' }).parentElement!
}

describe('UsersPage — sheet chi tiết người dùng', () => {
  it('bấm vào dòng → sheet hiện tên, trạng thái, vai trò và đủ các trường (trống hiện "Chưa có")', async () => {
    const { user } = renderWithProviders(<UsersPage />, { route: '/users', auth: ADMIN_FULL })
    // Bấm vào ô không tương tác (đăng nhập) — cả dòng là vùng bấm.
    await user.click(await screen.findByText('0340000000'))

    const sheet = await screen.findByRole('dialog', { name: 'Lê Minh' })
    expect(within(sheet).getByText('Hoạt động')).toBeInTheDocument()
    expect(within(sheet).getByText('Quản lý')).toBeInTheDocument()
    expect(within(field(sheet, 'Tên đăng nhập')).getByRole('link')).toHaveAttribute(
      'href',
      'tel:0340000000',
    )
    expect(within(field(sheet, 'Email')).getByText('Chưa có')).toBeInTheDocument()
    expect(field(sheet, 'Ngày sinh')).toHaveTextContent('20/05/1990')
    expect(field(sheet, 'Địa chỉ')).toHaveTextContent('Số 1, Cầu Giấy, Hà Nội')
    expect(
      within(field(sheet, 'Thành viên kho'))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Kho Hà Nội', 'Kho Hải Phòng'])
  })

  it('tên là nút cho bàn phím: focus + Enter mở sheet', async () => {
    const { user } = renderWithProviders(<UsersPage />, { route: '/users', auth: ADMIN_FULL })
    const name = await screen.findByRole('button', { name: 'Xem chi tiết Lê Minh' })
    name.focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('dialog', { name: 'Lê Minh' })).toBeInTheDocument()
  })

  it('bấm nút ⋯ trên dòng chỉ mở menu, không mở sheet', async () => {
    const { user } = renderWithProviders(<UsersPage />, { route: '/users', auth: ADMIN_FULL })
    await user.click(await screen.findByRole('button', { name: 'Thao tác với Lê Minh' }))
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('chân sheet có đúng các thao tác của menu ⋯; người chỉ xem → không có chân sheet', async () => {
    const admin = renderWithProviders(<UsersPage />, { route: '/users', auth: ADMIN_FULL })
    await admin.user.click(await screen.findByText('0340000000'))
    const sheet = await screen.findByRole('dialog', { name: 'Lê Minh' })
    const buttons = within(sheet)
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((label) => label !== '' && label !== 'Đóng')
    expect(buttons).toEqual(['Khoá', 'Đặt lại mật khẩu', 'Đổi vai trò', 'Sửa'])
    // Mở sheet không được đặt focus sẵn vào nút phá huỷ (Enter nhầm = mở hộp khoá) — focus ở chính khung sheet.
    await waitFor(() => expect(sheet).toHaveFocus())
    expect(within(sheet).getByRole('button', { name: 'Khoá' })).not.toHaveFocus()
    admin.unmount()

    const viewer = renderWithProviders(<UsersPage />, { route: '/users', auth: VIEWER })
    await viewer.user.click(await screen.findByText('0340000000'))
    const readOnly = await screen.findByRole('dialog', { name: 'Lê Minh' })
    expect(within(readOnly).queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument()
    expect(within(readOnly).queryByRole('button', { name: 'Khoá' })).not.toBeInTheDocument()
  })

  it('Khoá từ sheet → hộp xác nhận; khoá xong sheet tự cập nhật thành "Đã khoá" + nút "Mở khoá"', async () => {
    server.use(
      mswHttp.put(`${BASE}/users/u-man/lock`, () => {
        current = { ...manager, isActive: false }
        return ok(current)
      }),
    )
    const { user } = renderWithProviders(<UsersPage />, { route: '/users', auth: ADMIN_FULL })
    await user.click(await screen.findByText('0340000000'))
    const sheet = await screen.findByRole('dialog', { name: 'Lê Minh' })

    await user.click(within(sheet).getByRole('button', { name: 'Khoá' }))
    const confirm = await screen.findByRole('alertdialog')
    await user.type(within(confirm).getByLabelText('Nhập 0340000000 để xác nhận'), '0340000000')
    await user.click(within(confirm).getByRole('button', { name: 'Khoá' }))

    await waitFor(() => expect(within(sheet).getByText('Đã khoá')).toBeInTheDocument())
    expect(within(sheet).getByRole('button', { name: 'Mở khoá' })).toBeInTheDocument()
  })

  it('Sửa từ sheet mở form sửa của đúng người đó', async () => {
    const { user } = renderWithProviders(<UsersPage />, { route: '/users', auth: ADMIN_FULL })
    await user.click(await screen.findByText('0340000000'))
    const sheet = await screen.findByRole('dialog', { name: 'Lê Minh' })
    await user.click(within(sheet).getByRole('button', { name: 'Sửa' }))
    expect(await screen.findByRole('dialog', { name: /Sửa người dùng/ })).toBeInTheDocument()
  })

  it('mở sheet ghi ?user=<slug> lên URL và tải GET /users/{slug}; đóng thì gỡ khỏi URL', async () => {
    const { user } = renderPage()
    await user.click(await screen.findByText('0340000000'))
    await screen.findByRole('dialog', { name: 'Lê Minh' })
    expect(screen.getByTestId('location')).toHaveTextContent('user=u-man')
    await waitFor(() => expect(detailHits).toBe(1))

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByTestId('location')).not.toHaveTextContent('user=')
  })

  it('link ?user= mở thẳng sheet của người KHÔNG có trong trang danh sách đang xem', async () => {
    renderPage('/users?user=u-other')
    const sheet = await screen.findByRole('dialog', { name: 'Trần Hà' })
    expect(within(sheet).getByText('Giám sát')).toBeInTheDocument()
  })

  it('?user= ngoài phạm vi / đã xoá (100405) → sheet báo không tìm thấy kèm gợi ý, không có nút thao tác', async () => {
    renderPage('/users?user=u-ghost')
    const sheet = await screen.findByRole('dialog', { name: 'Thông tin người dùng' })
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'Người này có thể đã bị xoá, hoặc không thuộc kho nào của bạn.',
    )
    expect(within(sheet).queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument()
  })
})
