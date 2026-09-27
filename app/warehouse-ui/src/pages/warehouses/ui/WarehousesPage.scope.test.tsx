import { screen, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// Ghim `search` bật để kiểm việc ẩn ô tìm kiếm ở "Kho tôi quản lý" — các cờ khác giữ đúng giá trị
// đang commit (`sort`/`search` mặc định TẮT ở BACKEND_SUPPORTS thật) để không đổi hành vi phần còn
// lại của file. Không đọc `BACKEND_SUPPORTS` thật: tránh phụ thuộc thay đổi cục bộ chưa commit.
vi.mock('@/shared/api/backend-capabilities', () => ({
  BACKEND_SUPPORTS: {
    sort: false,
    search: true,
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

const base = {
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  address: 'Hà Nội',
  isActive: true,
}
const allWarehouse: Warehouse = { ...base, slug: 'kho-chung', name: 'Kho chung', code: 'WH-01' }
const myWarehouse: Warehouse = { ...base, slug: 'kho-cua-toi', name: 'Kho của tôi', code: 'WH-02' }

const MANAGER: TestAuth = {
  userId: 'u-m',
  userName: 'm',
  roleName: 'MANAGER',
  scope: ['WAREHOUSE_READ'],
}
const ADMIN: TestAuth = {
  userId: 'u-a',
  userName: 'a',
  roleName: 'ADMIN',
  scope: ['WAREHOUSE_READ', 'WAREHOUSE_CREATE', 'USER_READ'],
}

function LocationProbe() {
  const { search } = useLocation()
  return <output data-testid="location">{search}</output>
}

let mineCalls = 0

function renderPage(auth: TestAuth, route = '/warehouses') {
  return renderWithProviders(
    <>
      <WarehousesPage />
      <LocationProbe />
    </>,
    { route, auth },
  )
}

beforeEach(() => {
  mineCalls = 0
  server.use(
    mswHttp.get(`${BASE}/warehouses`, () => paginated([allWarehouse])),
    mswHttp.get(`${BASE}/warehouses/mine`, () => {
      mineCalls += 1
      return paginated([myWarehouse])
    }),
    mswHttp.get(`${BASE}/roles`, () => ok([])),
    mswHttp.get(`${BASE}/users`, () => paginated([])),
  )
})

describe('WarehousesPage — công tắc "Kho tôi quản lý"', () => {
  it('MANAGER thấy công tắc; mặc định "Tất cả kho"', async () => {
    renderPage(MANAGER)

    const group = await screen.findByRole('group', { name: 'Phạm vi danh sách' })
    expect(within(group).getByRole('button', { name: 'Tất cả kho' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(await screen.findByText('Kho chung')).toBeInTheDocument()
    expect(mineCalls).toBe(0)
  })

  it('bấm "Kho tôi quản lý" → ?scope=mine, gọi /warehouses/mine, hiện đúng kho của mình', async () => {
    const { user } = renderPage(MANAGER)

    await user.click(await screen.findByRole('button', { name: 'Kho tôi quản lý' }))

    expect(await screen.findByText('Kho của tôi')).toBeInTheDocument()
    expect(screen.queryByText('Kho chung')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('scope=mine')
    expect(mineCalls).toBeGreaterThan(0)
  })

  it('ở "Kho tôi quản lý": ẩn ô "Chỉ kho chưa có quản lý" và xoá bộ lọc đó khỏi URL', async () => {
    const { user } = renderPage(MANAGER, '/warehouses?hasManager=false')
    expect(await screen.findByText('Chỉ kho chưa có quản lý')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Kho tôi quản lý' }))

    expect(screen.queryByText('Chỉ kho chưa có quản lý')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).not.toHaveTextContent('hasManager')
  })

  it('ở "Kho tôi quản lý": ẩn ô tìm kiếm (backend /mine bỏ qua search) và xoá search khỏi URL', async () => {
    const { user } = renderPage(MANAGER, '/warehouses?search=ha+noi')
    expect(await screen.findByRole('searchbox')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Kho tôi quản lý' }))

    await screen.findByText('Kho của tôi')
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).not.toHaveTextContent('search')
  })

  it('không quản lý kho nào → câu trống riêng', async () => {
    server.use(mswHttp.get(`${BASE}/warehouses/mine`, () => paginated([])))
    renderPage(MANAGER, '/warehouses?scope=mine')

    expect(await screen.findByText('Bạn chưa được phân công quản lý kho nào.')).toBeInTheDocument()
  })

  it('ADMIN không thấy công tắc', async () => {
    renderPage(ADMIN)
    await screen.findByText('Kho chung')

    expect(screen.queryByRole('group', { name: 'Phạm vi danh sách' })).not.toBeInTheDocument()
  })

  it('SUPER_ADMIN không thấy công tắc (không bao giờ là quản lý kho)', async () => {
    renderPage('admin')
    await screen.findByText('Kho chung')

    expect(screen.queryByRole('group', { name: 'Phạm vi danh sách' })).not.toBeInTheDocument()
  })

  it('người không phải MANAGER mở link ?scope=mine → danh sách đầy đủ, KHÔNG gọi /mine', async () => {
    renderPage(ADMIN, '/warehouses?scope=mine')

    expect(await screen.findByText('Kho chung')).toBeInTheDocument()
    expect(mineCalls).toBe(0)
  })
})
