import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/api/backend-capabilities', () => ({
  BACKEND_SUPPORTS: {
    sort: false,
    userSort: true,
    supplierSearch: false,
    search: false,
    profileEdit: false,
    sessionList: false,
    authorityGuards: true,
    storeAuthorityGuards: true,
    permissionDelegationRules: true,
    userUpdate: true,
    userStatus: true,
    userSearch: true,
  },
}))

import type { Role, User } from '@/entities/user'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { UsersPage } from '@/pages/users'

const BASE = 'http://localhost:8085/api/v1'
const manager: User = {
  slug: 'u-man',
  createdAt: '',
  updatedAt: '',
  phonenumber: '0340000000',
  firstName: 'Minh',
  lastName: 'Lê',
  isActive: true,
  roleSlug: 'r-MANAGER',
  roleName: 'MANAGER',
}
const ROLES: Role[] = [
  { slug: 'r-MANAGER', name: 'MANAGER', level: 20, authorityCodes: [] },
  { slug: 'r-ADMIN', name: 'ADMIN', level: 30, authorityCodes: [] },
]

let userQuery = ''
beforeEach(() => {
  server.use(
    mswHttp.get(`${BASE}/users`, ({ request }) => {
      userQuery = new URL(request.url).searchParams.toString()
      return paginated([manager])
    }),
    mswHttp.get(`${BASE}/roles`, () => ok(ROLES)),
    mswHttp.get(`${BASE}/warehouses`, () =>
      paginated([{ slug: 'kho-hn', code: 'HN', name: 'Kho Hà Nội', isActive: true }]),
    ),
  )
})

const ADMIN_FULL = {
  userName: '0310000000',
  roleName: 'ADMIN',
  scope: ['USER_READ', 'USER_CREATE', 'USER_CHANGE_PASSWORD', 'ROLE_READ', 'USER_UPDATE'],
}

describe('UsersPage — cờ bật (backend đã deploy contract đề xuất)', () => {
  it('menu có Sửa, Đổi vai trò, Đặt lại mật khẩu, Khoá — không có Xoá (nghiệp vụ chỉ khoá)', async () => {
    const { user } = renderWithProviders(<UsersPage />, { route: '/users', auth: ADMIN_FULL })

    await user.click(await screen.findByRole('button', { name: 'Thao tác với Lê Minh' }))
    const items = within(await screen.findByRole('menu'))
      .getAllByRole('menuitem')
      .map((i) => i.textContent)

    expect(items).toEqual(['Sửa', 'Đổi vai trò', 'Đặt lại mật khẩu', 'Khoá'])
  })

  it('dòng đã khoá có "Mở khoá" thay cho "Khoá"', async () => {
    server.use(mswHttp.get(`${BASE}/users`, () => paginated([{ ...manager, isActive: false }])))
    const { user } = renderWithProviders(<UsersPage />, { route: '/users', auth: ADMIN_FULL })
    await user.click(await screen.findByRole('button', { name: 'Thao tác với Lê Minh' }))
    const items = within(await screen.findByRole('menu'))
      .getAllByRole('menuitem')
      .map((i) => i.textContent)
    expect(items).toContain('Mở khoá')
    expect(items).not.toContain('Khoá')
  })

  it.each([
    ['?search=minh', { name: 'minh' }],
    ['?search=0340', { phonenumber: '0340' }],
  ])('URL %s → gửi đúng tham số tìm kiếm, không gửi `search`', async (qs, expected) => {
    renderWithProviders(<UsersPage />, { route: `/users${qs}`, auth: ADMIN_FULL })
    await screen.findByText('Lê Minh')
    const sent = new URLSearchParams(userQuery)
    expect(sent.get('search')).toBeNull()
    for (const [k, v] of Object.entries(expected)) expect(sent.get(k)).toBe(v)
  })

  it('lọc trạng thái + lọc kho gửi isActive + warehouseSlug; ô lọc kho lấy từ GET /warehouses', async () => {
    renderWithProviders(<UsersPage />, {
      route: '/users?isActive=false&warehouseSlug=kho-hn',
      auth: { ...ADMIN_FULL, scope: [...ADMIN_FULL.scope, 'WAREHOUSE_READ'] },
    })
    await screen.findByText('Lê Minh')
    expect(screen.getByRole('combobox', { name: 'Trạng thái' })).toBeInTheDocument()
    expect(await screen.findByRole('combobox', { name: 'Kho' })).toBeInTheDocument()
    const sent = new URLSearchParams(userQuery)
    expect(sent.get('isActive')).toBe('false')
    expect(sent.get('warehouseSlug')).toBe('kho-hn')
  })

  it('lọc ngày tạo: URL startDate/endDate → gửi đúng, nút hiện khoảng', async () => {
    renderWithProviders(<UsersPage />, {
      route: '/users?startDate=2026-09-01&endDate=2026-09-30',
      auth: ADMIN_FULL,
    })
    await screen.findByText('Lê Minh')
    expect(screen.getByRole('button', { name: /^Ngày tạo: / })).toHaveTextContent(
      '01/09/2026 – 30/09/2026',
    )
    const sent = new URLSearchParams(userQuery)
    expect(sent.get('startDate')).toBe('2026-09-01')
    expect(sent.get('endDate')).toBe('2026-09-30')
  })

  it('lọc ngày tạo: URL sửa tay ngược chiều → đảo lại (tránh 400 USER_DATE_RANGE_INVALID)', async () => {
    renderWithProviders(<UsersPage />, {
      route: '/users?startDate=2026-09-30&endDate=2026-09-01',
      auth: ADMIN_FULL,
    })
    await screen.findByText('Lê Minh')
    const sent = new URLSearchParams(userQuery)
    expect(sent.get('startDate')).toBe('2026-09-01')
    expect(sent.get('endDate')).toBe('2026-09-30')
  })

  it('lọc ngày tạo: ngày sai định dạng trên URL bị bỏ, đầu còn lại vẫn gửi', async () => {
    renderWithProviders(<UsersPage />, {
      route: '/users?startDate=hom-qua&endDate=2026-09-30',
      auth: ADMIN_FULL,
    })
    await screen.findByText('Lê Minh')
    const sent = new URLSearchParams(userQuery)
    expect(sent.get('startDate')).toBeNull()
    expect(sent.get('endDate')).toBe('2026-09-30')
  })

  it('thiếu WAREHOUSE_READ → không có ô lọc kho, không gọi GET /warehouses, không gửi warehouseSlug', async () => {
    let warehouseCalls = 0
    server.use(
      mswHttp.get(`${BASE}/warehouses`, () => {
        warehouseCalls += 1
        return paginated([])
      }),
    )
    renderWithProviders(<UsersPage />, { route: '/users?warehouseSlug=kho-hn', auth: ADMIN_FULL })
    await screen.findByText('Lê Minh')
    expect(screen.queryByRole('combobox', { name: 'Kho' })).not.toBeInTheDocument()
    expect(warehouseCalls).toBe(0)
    expect(new URLSearchParams(userQuery).get('warehouseSlug')).toBeNull()
  })

  it('bấm tiêu đề Họ tên → gửi sort[]=firstName:ASC (cờ userSort riêng của màn này)', async () => {
    const { user } = renderWithProviders(<UsersPage />, { route: '/users', auth: ADMIN_FULL })
    await screen.findByText('Lê Minh')
    await user.click(screen.getByRole('button', { name: /Họ tên/ }))
    await waitFor(() => expect(decodeURIComponent(userQuery)).toContain('sort[]=firstName:ASC'))
  })
})
