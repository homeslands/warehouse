import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sort và search mặc định TẮT (backend chưa làm). File này bật cả hai để kiểm phần "dựng sẵn"
// thật sự chạy — nếu không, code sau cờ không bao giờ được thực thi và sẽ hỏng âm thầm cho tới
// ngày ai đó bật nó lên.
vi.mock('@/shared/api/backend-capabilities', () => ({
  BACKEND_SUPPORTS: { sort: true, search: true, userSort: false, supplierSearch: false },
}))

import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import type { Role, User } from '@/entities/user'
import type { Warehouse } from '@/entities/warehouse'
import { WarehousesPage } from '@/pages/warehouses'

const BASE = 'http://localhost:8085/api/v1'

const warehouse: Warehouse = {
  slug: 'kho-ha-noi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  name: 'Kho Hà Nội 1',
  code: 'WH-HN-01',
  address: 'Số 1, Cầu Giấy, Hà Nội',
  phonenumber: '02412345678',
  isActive: true,
  manager: { slug: 'u-manager', phonenumber: '0901234567', firstName: '', lastName: '' },
}

const roles: Role[] = [{ slug: 'r-manager', name: 'MANAGER', authorityCodes: [] }]
const users: User[] = []

function LocationProbe() {
  return <output data-testid="location">{useLocation().search}</output>
}

/** Query string thô của lần GET /warehouses gần nhất (chưa decode). */
function captureQuery() {
  const seen: string[] = []
  server.use(
    mswHttp.get(`${BASE}/warehouses`, ({ request }) => {
      seen.push(new URL(request.url).search)
      return paginated([warehouse], { page: 1, size: 10, total: 1 })
    }),
  )
  return seen
}

function renderPage(route = '/warehouses') {
  return renderWithProviders(
    <>
      <WarehousesPage />
      <LocationProbe />
    </>,
    { route, auth: 'admin' },
  )
}

beforeEach(() => {
  server.use(
    mswHttp.get(`${BASE}/roles`, () => Response.json({ result: roles })),
    mswHttp.get(`${BASE}/users`, () =>
      Response.json({ result: { items: users, total: 0, page: 1, pageSize: 100, totalPages: 0 } }),
    ),
  )
})

describe('WarehousesPage — sắp xếp (cờ bật)', () => {
  it('header cột bấm được và gửi sort dạng mảng lên backend', async () => {
    const seen = captureQuery()
    const { user } = renderPage()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('button', { name: /Tên kho|Tên/ }))

    await waitFor(() => expect(decodeURIComponent(seen.at(-1) ?? '')).toContain('sort[]=name:ASC'))
    expect(screen.getByTestId('location')).toHaveTextContent('sort=name%3AASC')
  })

  it('bấm lần hai đổi sang giảm dần', async () => {
    const seen = captureQuery()
    const { user } = renderPage('/warehouses?sort=name:ASC')
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('button', { name: /Tên kho|Tên/ }))

    await waitFor(() => expect(decodeURIComponent(seen.at(-1) ?? '')).toContain('sort[]=name:DESC'))
  })

  it('cột không khai sortField thì không bấm được', async () => {
    captureQuery()
    renderPage()
    await screen.findByText('Kho Hà Nội 1')

    expect(screen.queryByRole('button', { name: /Trạng thái/ })).not.toBeInTheDocument()
  })
})

describe('WarehousesPage — tìm kiếm (cờ bật)', () => {
  it('gõ vào ô tìm → ghi lên URL và gửi lên backend', async () => {
    const seen = captureQuery()
    const { user } = renderPage()
    await screen.findByText('Kho Hà Nội 1')

    await user.type(screen.getByRole('searchbox'), 'hà nội')

    // Dấu cách trong query string là `+`, `decodeURIComponent` không đổi nó → đọc qua
    // URLSearchParams thay vì so chuỗi thô.
    await waitFor(() => expect(new URLSearchParams(seen.at(-1) ?? '').get('search')).toBe('hà nội'))
    expect(screen.getByTestId('location')).toHaveTextContent('search=')
  })
})
