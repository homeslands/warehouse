/**
 * `break-ui`: popover "Bộ lọc" của trang Người dùng (nhiều bộ lọc: vai trò, trạng thái, kho, ngày tạo) với tên
 * kho / vai trò rất dài. Đặt `BREAK_UI_OUT=<thư mục>` thì ghi HTML ra đó để dựng trang chụp (xem
 * `ImportFormsPage.break-ui.test.tsx`) — chỉ dùng khi dev.
 */
import { screen, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
    userSearch: true,
  },
}))
const fit = vi.hoisted(() => ({ fits: false }))
vi.mock('@/shared/ui/data-table/toolbar-fit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/ui/data-table/toolbar-fit')>()
  return {
    ...actual,
    useToolbarFit: () => ({
      rowRef: { current: null },
      filtersRef: { current: null },
      actionsRef: { current: null },
      fits: fit.fits,
    }),
  }
})

import type { Role } from '@/entities/user'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { UsersPage } from '@/pages/users'

const BASE = 'http://localhost:8085/api/v1'
const OUT = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  .BREAK_UI_OUT
const FS_MODULE = 'node:fs'

async function dump(name: string, html: string) {
  if (!OUT) return
  const fs = (await import(/* @vite-ignore */ FS_MODULE)) as {
    mkdirSync: (p: string, o: { recursive: boolean }) => void
    writeFileSync: (p: string, data: string) => void
  }
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(`${OUT}/${name}.html`, html)
}

const LONG_ROLE = 'Giám sát viên kho vận khu vực phía Nam kiêm phụ trách kiểm kê định kỳ'
const ROLES: Role[] = [
  { slug: 'r-1', name: 'ADMIN', level: 30, authorityCodes: [] },
  { slug: 'r-2', name: 'MANAGER', level: 20, authorityCodes: [] },
  { slug: 'r-3', name: 'SUPERVISOR', level: 10, authorityCodes: [] },
]

describe('UsersPage — break-ui', () => {
  afterEach(() => vi.restoreAllMocks())

  it('popover Bộ lọc: vai trò tên rất dài → nút xuống dòng, không tràn', async () => {
    server.use(
      mswHttp.get(`${BASE}/users`, () => paginated([])),
      mswHttp.get(`${BASE}/roles`, () =>
        ok([{ slug: 'r-9', name: LONG_ROLE, level: 5, authorityCodes: [] }, ...ROLES.slice(0, 2)]),
      ),
      mswHttp.get(`${BASE}/warehouses`, () => paginated([])),
    )
    const { user } = renderWithProviders(<UsersPage />, {
      auth: {
        userName: '0310000000',
        roleName: 'ADMIN',
        scope: ['USER_READ', 'USER_CREATE', 'ROLE_READ', 'WAREHOUSE_READ'],
      },
    })
    await user.click(await screen.findByRole('button', { name: /Bộ lọc/ }))
    const panel = await screen.findByRole('dialog', { name: 'Bộ lọc' })
    const button = await within(panel).findByRole('button', { name: LONG_ROLE })
    expect(button).toHaveClass('whitespace-normal', 'max-w-full', 'h-auto')
    await dump(
      'users-popover-long-role',
      `<div class="${panel.className}" style="position:relative;margin:16px">${panel.innerHTML}</div>`,
    )
  })

  it('popover Bộ lọc: vai trò (3 lựa chọn → nút), trạng thái, kho tên rất dài, ngày tạo', async () => {
    server.use(
      mswHttp.get(`${BASE}/users`, () => paginated([])),
      mswHttp.get(`${BASE}/roles`, () => ok(ROLES)),
      mswHttp.get(`${BASE}/warehouses`, () =>
        paginated([
          {
            slug: 'w-1',
            code: 'K1',
            name: 'Kho trung tâm phân phối miền Nam số một rất dài '.repeat(2),
            isActive: true,
          },
          { slug: 'w-2', code: 'K2', name: 'Kho B', isActive: true },
          { slug: 'w-3', code: 'K3', name: 'Kho C', isActive: true },
          { slug: 'w-4', code: 'K4', name: 'Kho D', isActive: true },
          { slug: 'w-5', code: 'K5', name: 'Kho E', isActive: true },
        ]),
      ),
    )
    const { user } = renderWithProviders(<UsersPage />, {
      auth: {
        userName: '0310000000',
        roleName: 'ADMIN',
        scope: ['USER_READ', 'USER_CREATE', 'ROLE_READ', 'WAREHOUSE_READ'],
      },
    })
    await user.click(await screen.findByRole('button', { name: /Bộ lọc/ }))
    const panel = await screen.findByRole('dialog', { name: 'Bộ lọc' })
    expect(await within(panel).findByRole('button', { name: 'Hoạt động' })).toBeInTheDocument()
    await dump(
      'users-popover',
      `<div class="${panel.className}" style="position:relative;margin:16px">${panel.innerHTML}</div>`,
    )
  })
})
