import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders, type TestAuth } from '@/shared/test/render'
import type { Role } from '@/entities/user'
import { RolesPage } from './RolesPage'

const BASE = 'http://localhost:8085/api/v1'
const roles: Role[] = [
  { slug: 'supervisor', name: 'SUPERVISOR', level: 10, authorityCodes: ['A'] },
  { slug: 'tl', name: 'Trưởng nhóm', level: 15, authorityCodes: [] },
  { slug: 'admin', name: 'ADMIN', level: 30, authorityCodes: ['A', 'B'] },
  { slug: 'manager', name: 'MANAGER', level: 20, authorityCodes: [] },
]
const ADMIN: TestAuth = {
  userName: 'a',
  roleName: 'ADMIN',
  scope: ['ROLE_READ', 'ROLE_CREATE', 'ROLE_UPDATE', 'ROLE_DELETE'],
  role: { slug: 'admin', name: 'ADMIN', level: 30 },
}

function setup(auth: TestAuth = ADMIN) {
  server.use(mswHttp.get(`${BASE}/roles`, () => ok(roles)))
  return renderWithProviders(<RolesPage />, { auth, route: '/roles' })
}

const firstCells = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent)

describe('RolesPage', () => {
  it('xếp theo cấp giảm dần; badge Có sẵn / Bạn; nút Thêm vai trò', async () => {
    setup()
    expect(await screen.findByRole('heading', { level: 1, name: 'Vai trò' })).toBeInTheDocument()
    await screen.findByText('Trưởng nhóm')
    const names = firstCells()
    expect(names[0]).toContain('Quản trị viên')
    expect(names[1]).toContain('Quản lý')
    expect(names[2]).toContain('Trưởng nhóm')
    expect(names[3]).toContain('Giám sát')
    expect(screen.getByText('Bạn')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thêm vai trò' })).toBeInTheDocument()
  })

  it('dòng của mình không có ⋯; vai trò có sẵn thấp hơn: Xoá khoá kèm lý do; vai trò tự tạo: Sửa + Xoá', async () => {
    const { user } = setup()
    await screen.findByText('Trưởng nhóm')
    expect(
      screen.queryByRole('button', { name: 'Thao tác với Quản trị viên' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Thao tác với Quản lý' }))
    const del = within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Xoá' })
    expect(del).toHaveAttribute('aria-disabled', 'true')
    expect(del).toHaveAccessibleDescription('Vai trò có sẵn không xoá được')
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Trưởng nhóm' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Sửa mô tả' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Xoá' })).not.toHaveAttribute('aria-disabled')
    expect(within(menu).queryByRole('menuitem', { name: 'Mở phân quyền' })).not.toBeInTheDocument()
  })

  it('Sửa mô tả mở sheet của đúng vai trò; Xoá mở hộp xác nhận của đúng vai trò', async () => {
    const { user } = setup()
    await screen.findByText('Trưởng nhóm')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Trưởng nhóm' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Sửa mô tả' }))
    const sheet = await screen.findByRole('dialog', { name: 'Sửa vai trò' })
    expect(within(sheet).getByText('Trưởng nhóm')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Thao tác với Trưởng nhóm' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Xoá' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Trưởng nhóm')
  })

  it('người mang vai trò tự tạo cấp 15: chỉ thao tác dòng thấp hơn (Giám sát); có MANAGE_PERMISSIONS thì thêm Mở phân quyền', async () => {
    const { user } = setup({
      userName: 't',
      roleName: 'Trưởng nhóm',
      scope: ['ROLE_READ', 'ROLE_UPDATE', 'MANAGE_PERMISSIONS'],
      role: { slug: 'tl', name: 'Trưởng nhóm', level: 15 },
    })
    await screen.findByText('Trưởng nhóm')
    expect(screen.getAllByRole('button', { name: /^Thao tác với/ })).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Thao tác với Giám sát' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Sửa mô tả' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Mở phân quyền' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Xoá' })).not.toBeInTheDocument()
  })

  it('chỉ ROLE_READ: không nút Thêm, không cột thao tác', async () => {
    setup({
      userName: 'm',
      roleName: 'MANAGER',
      scope: ['ROLE_READ'],
      role: { slug: 'manager', name: 'MANAGER', level: 20 },
    })
    await screen.findByText('Trưởng nhóm')
    expect(screen.queryByRole('button', { name: 'Thêm vai trò' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Thao tác' })).not.toBeInTheDocument()
  })
})
