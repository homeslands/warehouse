import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithRouter } from '@/shared/test/render'
import { queryClient } from '@/app/query-client'
import { createRoutes } from '@/app/routes'

// Ở tầng app: cần queryClient THẬT (QueryCache.onError toast khi tải lại lỗi mà đã có dữ liệu) để
// chứng minh xoá từ trang chi tiết KHÔNG bắn toast 404 cho chính bản ghi vừa xoá.
const BASE = 'http://localhost:8085/api/v1'

afterEach(() => queryClient.clear())

describe('xoá kho từ trang chi tiết', () => {
  it('về danh sách và KHÔNG có toast lỗi 404', async () => {
    let deleted = false
    server.use(
      mswHttp.get(`${BASE}/warehouses/kho-ha-noi`, () =>
        deleted
          ? apiError(404, 100501, 'Warehouse not found')
          : ok({
              slug: 'kho-ha-noi',
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: '2026-09-01T00:00:00.000Z',
              name: 'Kho Hà Nội 1',
              code: 'WH-HN-01',
              address: 'Hà Nội',
              isActive: false,
            }),
      ),
      mswHttp.delete(`${BASE}/warehouses/kho-ha-noi`, () => {
        deleted = true
        return ok('1 warehouse have been deleted')
      }),
      mswHttp.get(`${BASE}/warehouses`, () => paginated([])),
      mswHttp.get(`${BASE}/roles`, () => ok([])),
    )
    const { user, router } = renderWithRouter(createRoutes({ dev: false }), {
      route: '/warehouses/kho-ha-noi',
      auth: 'admin',
      queryClient,
    })
    await screen.findByRole('heading', { level: 1, name: 'Kho Hà Nội 1' })

    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Xoá' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Xoá' }),
    )

    await waitFor(() => expect(router.state.location.pathname).toBe('/warehouses'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe('xoá cửa hàng từ trang chi tiết', () => {
  it('về danh sách và KHÔNG có toast lỗi 404', async () => {
    let deleted = false
    server.use(
      mswHttp.get(`${BASE}/stores/ch-ha-noi`, () =>
        deleted
          ? apiError(404, 101001, 'Store not found')
          : ok({
              slug: 'ch-ha-noi',
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: '2026-09-01T00:00:00.000Z',
              name: 'Cửa hàng Hà Nội 1',
              code: 'ST-HN-01',
              legalName: 'Công ty TNHH ABC',
              taxCode: '0101234567',
              isActive: false,
            }),
      ),
      mswHttp.delete(`${BASE}/stores/ch-ha-noi`, () => {
        deleted = true
        return ok('1 store have been deleted')
      }),
      mswHttp.get(`${BASE}/stores`, () => paginated([])),
      mswHttp.get(`${BASE}/roles`, () => ok([])),
    )
    const { user, router } = renderWithRouter(createRoutes({ dev: false }), {
      route: '/stores/ch-ha-noi',
      auth: 'admin',
      queryClient,
    })
    await screen.findByRole('heading', { level: 1, name: 'Cửa hàng Hà Nội 1' })

    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Xoá' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Xoá' }),
    )

    await waitFor(() => expect(router.state.location.pathname).toBe('/stores'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(toast.error).not.toHaveBeenCalled()
  })
})
