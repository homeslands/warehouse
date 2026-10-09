import { screen, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Chạy với cờ BẬT: backend đã gác kho bằng @RequireAuthority. Phần cờ tắt nằm ở
// WarehousesPage.test.tsx.
vi.mock('@/shared/api/backend-capabilities', () => ({
  BACKEND_SUPPORTS: {
    sort: false,
    userSort: false,
    supplierSearch: false,
    search: false,
    profileEdit: false,
    sessionList: false,
    authorityGuards: true,
    storeAuthorityGuards: false,
  },
}))

import type { Warehouse } from '@/entities/warehouse'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { WarehousesPage } from '@/pages/warehouses'

const BASE = 'http://localhost:8085/api/v1'

const warehouse = {
  slug: 'kho-a',
  code: 'KA',
  name: 'Kho A',
  isActive: false,
} as unknown as Warehouse

function renderAs(roleName: string, scope: string[]) {
  return renderWithProviders(<WarehousesPage />, {
    route: '/warehouses',
    auth: { userName: 't', roleName, scope },
  })
}

async function openRowMenu(user: ReturnType<typeof renderAs>['user']) {
  await user.click(await screen.findByRole('button', { name: 'Thao tác với Kho A' }))
  return screen.findByRole('menu')
}

beforeEach(() => {
  server.use(
    mswHttp.get(`${BASE}/warehouses`, () => paginated([warehouse])),
    mswHttp.get(`${BASE}/roles`, () => ok([])),
  )
})

describe('WarehousesPage — gác theo authority (cờ bật)', () => {
  it('MANAGER có WAREHOUSE_CREATE → thấy nút Tạo kho, không có cột Thao tác', async () => {
    renderAs('MANAGER', ['WAREHOUSE_READ', 'WAREHOUSE_CREATE'])
    await screen.findByText('Kho A')

    expect(screen.getByRole('button', { name: 'Tạo kho' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thao tác với Kho A' })).not.toBeInTheDocument()
  })

  it('ADMIN chỉ có WAREHOUSE_READ → không nút Tạo, không cột Thao tác, không ô lọc quản lý', async () => {
    renderAs('ADMIN', ['WAREHOUSE_READ'])
    await screen.findByText('Kho A')

    expect(screen.queryByRole('button', { name: 'Tạo kho' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thao tác với Kho A' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Lọc theo quản lý' })).not.toBeInTheDocument()
  })

  it('chỉ WAREHOUSE_DELETE → menu dòng chỉ có Xoá', async () => {
    const { user } = renderAs('MANAGER', ['WAREHOUSE_READ', 'WAREHOUSE_DELETE'])
    const menu = await openRowMenu(user)

    expect(within(menu).getByRole('menuitem', { name: 'Xoá' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Sửa' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Gán quản lý' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Mở hoạt động' })).not.toBeInTheDocument()
  })

  it('WAREHOUSE_UPDATE → có Sửa và Mở/Ngừng hoạt động (cùng là PATCH), không có Xoá', async () => {
    const { user } = renderAs('MANAGER', ['WAREHOUSE_READ', 'WAREHOUSE_UPDATE'])
    const menu = await openRowMenu(user)

    expect(within(menu).getByRole('menuitem', { name: 'Sửa' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Mở hoạt động' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Xoá' })).not.toBeInTheDocument()
  })

  it('WAREHOUSE_ASSIGN_MANAGER mà thiếu USER_READ → KHÔNG có Gán quản lý', async () => {
    const { user } = renderAs('MANAGER', [
      'WAREHOUSE_READ',
      'WAREHOUSE_UPDATE',
      'WAREHOUSE_ASSIGN_MANAGER',
    ])
    const menu = await openRowMenu(user)

    expect(within(menu).queryByRole('menuitem', { name: 'Gán quản lý' })).not.toBeInTheDocument()
  })
})
