import { screen } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// Ghim cờ theo giá trị đang commit — không đọc BACKEND_SUPPORTS thật (tránh thay đổi cục bộ chưa commit).
vi.mock('@/shared/api/backend-capabilities', () => ({
  BACKEND_SUPPORTS: {
    sort: false,
    userSort: false,
    search: false,
    profileEdit: false,
    sessionList: false,
    authorityGuards: true,
    storeAuthorityGuards: true,
    permissionDelegationRules: false,
  },
}))

import type { Warehouse } from '@/entities/warehouse'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders, type TestAuth } from '@/shared/test/render'
import { WarehousesPage } from '@/pages/warehouses'

const BASE = 'http://localhost:8085/api/v1'

const warehouse: Warehouse = {
  slug: 'kho-cua-toi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  name: 'Kho của tôi',
  code: 'WH-02',
  address: 'Hà Nội',
  isActive: true,
  manager: { slug: 'u-m', phonenumber: '0901234567', firstName: 'Văn A', lastName: 'Nguyễn' },
}

const MANAGER: TestAuth = {
  userName: 'm',
  roleName: 'MANAGER',
  scope: ['WAREHOUSE_READ'],
}
const SUPERVISOR: TestAuth = { ...MANAGER, userName: 's', roleName: 'SUPERVISOR' }
const ADMIN: TestAuth = {
  userName: 'a',
  roleName: 'ADMIN',
  scope: ['WAREHOUSE_READ', 'USER_READ', 'ROLE_READ'],
}

function LocationProbe() {
  const { search } = useLocation()
  return <output data-testid="location">{search}</output>
}

let listQueries: string[] = []
let mineCalls = 0
let rolesCalls = 0

beforeEach(() => {
  listQueries = []
  mineCalls = 0
  rolesCalls = 0
  server.use(
    mswHttp.get(`${BASE}/warehouses`, ({ request }) => {
      listQueries.push(new URL(request.url).search)
      return paginated([warehouse])
    }),
    mswHttp.get(`${BASE}/warehouses/mine`, () => {
      mineCalls += 1
      return paginated([warehouse])
    }),
    mswHttp.get(`${BASE}/roles`, () => {
      rolesCalls += 1
      return ok([{ slug: 'r-manager', name: 'MANAGER', authorityCodes: [] }])
    }),
    mswHttp.get(`${BASE}/users`, () => paginated([])),
  )
})

function renderPage(auth: TestAuth, route = '/warehouses') {
  return renderWithProviders(
    <>
      <WarehousesPage />
      <LocationProbe />
    </>,
    { route, auth },
  )
}

describe('WarehousesPage — MANAGER (backend tự lọc kho mình phụ trách)', () => {
  it('một request GET /warehouses, không gọi /warehouses/mine, không có công tắc "kho của tôi"', async () => {
    renderPage(MANAGER)

    expect(await screen.findByText('Kho của tôi')).toBeInTheDocument()
    expect(listQueries).toHaveLength(1)
    expect(mineCalls).toBe(0)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kho tôi quản lý' })).not.toBeInTheDocument()
  })

  it('ẩn bộ lọc theo quản lý (backend bỏ qua) và không gửi managerSlug/hasManager dù có trên URL', async () => {
    renderPage(MANAGER, '/warehouses?managerSlug=u-x&hasManager=false')
    await screen.findByText('Kho của tôi')

    expect(screen.queryByRole('combobox', { name: 'Lọc theo quản lý' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Chỉ kho chưa có quản lý')).not.toBeInTheDocument()
    expect(listQueries.at(-1)).not.toContain('managerSlug')
    expect(listQueries.at(-1)).not.toContain('hasManager')
  })

  it('chưa được phân công kho nào → câu báo riêng', async () => {
    server.use(mswHttp.get(`${BASE}/warehouses`, () => paginated([])))
    renderPage(MANAGER)

    expect(await screen.findByText('Bạn chưa quản lý hay thuộc kho nào.')).toBeInTheDocument()
  })

  it('cột Quản lý hiện "Họ tên (số điện thoại)" từ object manager', async () => {
    renderPage(MANAGER)
    expect(await screen.findByText('Nguyễn Văn A (0901234567)')).toBeInTheDocument()
  })
})

describe('WarehousesPage — SUPERVISOR (backend lọc theo kho mình là thành viên, PR #72)', () => {
  it('ẩn bộ lọc theo quản lý và không gửi managerSlug/hasManager dù có trên URL', async () => {
    renderPage(SUPERVISOR, '/warehouses?managerSlug=u-x&hasManager=false')
    await screen.findByText('Kho của tôi')

    expect(screen.queryByLabelText('Chỉ kho chưa có quản lý')).not.toBeInTheDocument()
    expect(listQueries.at(-1)).not.toContain('managerSlug')
    expect(listQueries.at(-1)).not.toContain('hasManager')
  })

  it('chưa thuộc kho nào → câu báo riêng', async () => {
    server.use(mswHttp.get(`${BASE}/warehouses`, () => paginated([])))
    renderPage(SUPERVISOR)

    expect(await screen.findByText('Bạn chưa quản lý hay thuộc kho nào.')).toBeInTheDocument()
  })
})

describe('WarehousesPage — vai trò khác MANAGER', () => {
  it('ADMIN đủ USER_READ + ROLE_READ → có bộ lọc quản lý và ô "chưa có quản lý", managerSlug lên request', async () => {
    renderPage(ADMIN, '/warehouses?managerSlug=u-x')
    await screen.findByText('Kho của tôi')

    expect(screen.getByRole('combobox', { name: 'Lọc theo quản lý' })).toBeInTheDocument()
    expect(screen.getByLabelText('Chỉ kho chưa có quản lý')).toBeInTheDocument()
    expect(listQueries.at(-1)).toContain('managerSlug=u-x')
  })

  it('thiếu ROLE_READ → không có bộ lọc quản lý và không gọi GET /roles (sẽ 403)', async () => {
    renderPage({ ...ADMIN, scope: ['WAREHOUSE_READ', 'USER_READ'] })
    await screen.findByText('Kho của tôi')

    expect(screen.queryByRole('combobox', { name: 'Lọc theo quản lý' })).not.toBeInTheDocument()
    expect(rolesCalls).toBe(0)
  })
})
