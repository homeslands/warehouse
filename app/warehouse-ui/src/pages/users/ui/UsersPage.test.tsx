import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/api/backend-capabilities', () => ({
  BACKEND_SUPPORTS: {
    sort: false,
    userSort: false,
    supplierSearch: false,
    search: false,
    profileEdit: false,
    sessionList: false,
    authorityGuards: true,
    storeAuthorityGuards: true,
    permissionDelegationRules: true,
    userUpdate: false,
    userStatus: false,
    userSearch: false,
  },
}))

import type { Role, User } from '@/entities/user'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { UsersPage } from '@/pages/users'

const BASE = 'http://localhost:8085/api/v1'

const u = (phonenumber: string, roleName: string, firstName = roleName): User => ({
  slug: `u-${phonenumber}`,
  createdAt: 'Wed Sep 30 2026 11:22:59 GMT+0700 (Indochina Time)',
  updatedAt: '',
  phonenumber,
  firstName,
  lastName: 'Test',
  isActive: true,
  roleSlug: `r-${roleName}`,
  roleName,
})
const ROWS = [
  u('0310000000', 'ADMIN'),
  u('0340000000', 'MANAGER'),
  u('0330000000', 'SUPERVISOR'),
  u('0399999999', 'TEAM_LEAD'),
]
const ROLES: Role[] = [
  { slug: 'r-SUPERVISOR', name: 'SUPERVISOR', level: 10, authorityCodes: [] },
  { slug: 'r-MANAGER', name: 'MANAGER', level: 20, authorityCodes: [] },
  { slug: 'r-ADMIN', name: 'ADMIN', level: 30, authorityCodes: [] },
  { slug: 'r-TEAM_LEAD', name: 'TEAM_LEAD', level: 15, authorityCodes: [] },
]

let roleCalls = 0
let userQuery = ''
beforeEach(() => {
  roleCalls = 0
  server.use(
    mswHttp.get(`${BASE}/users`, ({ request }) => {
      userQuery = new URL(request.url).searchParams.toString()
      return paginated(ROWS)
    }),
    mswHttp.get(`${BASE}/roles`, () => {
      roleCalls += 1
      return ok(ROLES)
    }),
  )
})

const ADMIN_AUTH = {
  userName: '0310000000',
  roleName: 'ADMIN',
  scope: ['USER_READ', 'USER_CREATE', 'USER_CHANGE_PASSWORD', 'ROLE_READ'],
}
const MANAGER_AUTH = {
  userName: '0340000000',
  roleName: 'MANAGER',
  scope: ['USER_READ', 'USER_CHANGE_PASSWORD'],
}
// MANAGER quản được SUPERVISOR (canManageTarget) nhưng thiếu USER_CHANGE_PASSWORD → không thao
// tác được với ai (cờ sửa/khoá/xoá cũng tắt trong file test này), nên không dòng nào có menu.
const VIEWER_AUTH = {
  userName: '0350000000',
  roleName: 'MANAGER',
  scope: ['USER_READ'],
}

const menuButton = (name: string) => screen.queryByRole('button', { name: `Thao tác với ${name}` })

describe('UsersPage — ADMIN', () => {
  it('có nút Thêm người dùng, ô lọc vai trò; dòng của mình có nhãn Bạn và không có menu', async () => {
    renderWithProviders(<UsersPage />, { route: '/users', auth: ADMIN_AUTH })

    expect(await screen.findByRole('heading', { name: 'Người dùng', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('Test ADMIN')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thêm người dùng' })).toBeInTheDocument()
    expect(await screen.findByRole('combobox', { name: 'Vai trò' })).toBeInTheDocument()
    expect(screen.getByText('Bạn')).toBeInTheDocument()
    expect(menuButton('Test ADMIN')).not.toBeInTheDocument()
  })

  it('menu của dòng MANAGER chỉ có Đặt lại mật khẩu (cờ sửa/khoá/xoá tắt)', async () => {
    const { user } = renderWithProviders(<UsersPage />, { route: '/users', auth: ADMIN_AUTH })

    await user.click(await screen.findByRole('button', { name: 'Thao tác với Test MANAGER' }))
    const menu = await screen.findByRole('menu')

    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Đặt lại mật khẩu'])
  })

  it('không gửi search/isActive/sort lên backend dù URL có (cờ tắt)', async () => {
    renderWithProviders(<UsersPage />, {
      route:
        '/users?search=lan&isActive=false&warehouseSlug=kho-hn&startDate=2026-09-01&endDate=2026-09-30&sort=createdAt:DESC',
      auth: ADMIN_AUTH,
    })

    await screen.findByText('Test ADMIN')
    expect(userQuery).toBe('page=1&size=10')
  })

  it('nút Thêm người dùng bị khoá khi GET /roles lỗi, mở được khi tải xong', async () => {
    server.use(mswHttp.get(`${BASE}/roles`, () => apiError(500)))
    renderWithProviders(<UsersPage />, { route: '/users', auth: ADMIN_AUTH })

    await screen.findByText('Test ADMIN')
    expect(screen.getByRole('button', { name: 'Thêm người dùng' })).toBeDisabled()
  })

  it('nút Thêm người dùng mở được ngay khi GET /roles tải xong', async () => {
    renderWithProviders(<UsersPage />, { route: '/users', auth: ADMIN_AUTH })

    await screen.findByText('Test ADMIN')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Thêm người dùng' })).toBeEnabled(),
    )
  })
})

describe('UsersPage — ADMIN thấy toàn bộ', () => {
  it('thấy cả ADMIN khác, vai trò tự tạo', async () => {
    renderWithProviders(<UsersPage />, { route: '/users', auth: ADMIN_AUTH })

    await screen.findByText('Test SUPERVISOR')
    expect(screen.getByText('Test TEAM_LEAD')).toBeInTheDocument()
    expect(screen.getByText('Test ADMIN')).toBeInTheDocument()
  })
})

describe('UsersPage — MANAGER (không có ROLE_READ, không có USER_CREATE)', () => {
  it('không nút Thêm, không ô lọc vai trò, KHÔNG gọi GET /roles', async () => {
    renderWithProviders(<UsersPage />, { route: '/users', auth: MANAGER_AUTH })

    await screen.findByText('Test SUPERVISOR')
    expect(screen.queryByRole('button', { name: 'Thêm người dùng' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Vai trò' })).not.toBeInTheDocument()
    expect(roleCalls).toBe(0)
  })

  it('không lọc thêm ở client: hiện đủ những gì backend trả (backend đã lọc theo kho); người cao hơn không có menu', async () => {
    renderWithProviders(<UsersPage />, { route: '/users', auth: MANAGER_AUTH })

    await screen.findByText('Test SUPERVISOR')
    expect(screen.getByText('Test MANAGER')).toBeInTheDocument() // chính mình (0340000000)
    expect(screen.getByText('Test ADMIN')).toBeInTheDocument()
    expect(screen.getByText('Test TEAM_LEAD')).toBeInTheDocument()
    expect(menuButton('Test ADMIN')).not.toBeInTheDocument()
    expect(menuButton('Test TEAM_LEAD')).not.toBeInTheDocument()
  })

  it('menu chỉ có trên dòng SUPERVISOR, không có trên dòng của chính mình', async () => {
    renderWithProviders(<UsersPage />, { route: '/users', auth: MANAGER_AUTH })

    await screen.findByText('Test SUPERVISOR')
    expect(menuButton('Test SUPERVISOR')).toBeInTheDocument()
    expect(menuButton('Test MANAGER')).not.toBeInTheDocument()
  })
})

describe('UsersPage — người chỉ xem (USER_READ, không có mã ghi nào)', () => {
  it('không dựng cột Thao tác, không dòng nào có nút Thao tác với …', async () => {
    renderWithProviders(<UsersPage />, { route: '/users', auth: VIEWER_AUTH })

    await screen.findByText('Test SUPERVISOR')
    expect(screen.queryByRole('columnheader', { name: 'Thao tác' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Thao tác với/ })).not.toBeInTheDocument()
  })
})
