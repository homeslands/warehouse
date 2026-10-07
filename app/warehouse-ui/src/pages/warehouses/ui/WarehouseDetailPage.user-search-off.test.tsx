import { screen } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'

// Cờ `userSearch` TẮT: backend cũ bỏ qua `warehouseSlug` → khối Thành viên sẽ liệt kê mọi người dùng.
vi.mock('@/shared/api/backend-capabilities', () => ({
  BACKEND_SUPPORTS: {
    sort: false,
    userSort: false,
    search: false,
    userSearch: false,
    profileEdit: false,
    sessionList: false,
    authorityGuards: true,
    storeAuthorityGuards: false,
  },
}))

import type { Warehouse } from '@/entities/warehouse'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithRouter } from '@/shared/test/render'
import { WarehouseDetailPage } from './WarehouseDetailPage'

const BASE = 'http://localhost:8085/api/v1'

const warehouse = {
  slug: 'kho-ha-noi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  name: 'Kho Hà Nội 1',
  code: 'WH-HN-01',
  isActive: true,
} as Warehouse

describe('WarehouseDetailPage — cờ userSearch tắt', () => {
  it('đủ quyền vẫn không có khối Thành viên và không gọi GET /users', async () => {
    const calls: string[] = []
    server.use(
      mswHttp.get(`${BASE}/warehouses/kho-ha-noi`, () => ok(warehouse)),
      mswHttp.get(`${BASE}/users`, ({ request }) => {
        calls.push(request.url)
        return paginated([])
      }),
    )
    renderWithRouter([{ path: '/warehouses/:slug', element: <WarehouseDetailPage /> }], {
      route: '/warehouses/kho-ha-noi',
      auth: {
        userName: 'a',
        roleName: 'ADMIN',
        scope: ['WAREHOUSE_READ', 'WAREHOUSE_UPDATE', 'USER_READ'],
      },
    })
    await screen.findByRole('heading', { level: 1 })

    expect(screen.queryByRole('heading', { level: 2, name: 'Thành viên' })).not.toBeInTheDocument()
    expect(calls).toEqual([])
  })
})
