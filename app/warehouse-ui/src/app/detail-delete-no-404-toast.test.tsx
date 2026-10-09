import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))
// Tab Giao dịch nằm sau cờ `supplierTransactions` (mặc định tắt) — bật để ca ?tab=transactions thật sự mở tab đó.
vi.mock('@/shared/api/backend-capabilities', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/shared/api/backend-capabilities')>()
  return { ...mod, BACKEND_SUPPORTS: { ...mod.BACKEND_SUPPORTS, supplierTransactions: true } }
})

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

describe('xoá nhà cung cấp từ trang chi tiết', () => {
  // `@/pages/suppliers` kéo theo 2 tab + 4 form/hộp thoại — lần transform NGUỘI khi cả suite chạy song song
  // có thể vượt 5s. Nạp module trước (ngoài mọi test) để test chạy với timeout mặc định.
  beforeAll(() => import('@/pages/suppliers'), 15000)

  it.each(['materials', 'transactions'])(
    'ở ?tab=%s: về danh sách và KHÔNG có toast lỗi 404 (detail/materials/transactions đều 404 sau xoá)',
    async (tab) => {
      let deleted = false
      let hitsAfterDelete = 0
      const gone = (code: number) => {
        hitsAfterDelete += 1
        return apiError(404, code, 'Supplier not found')
      }
      server.use(
        mswHttp.get(`${BASE}/suppliers/ncc-abc`, () =>
          deleted
            ? gone(101210)
            : ok({
                slug: 'ncc-abc',
                createdAt: '2026-09-01T00:00:00.000Z',
                updatedAt: '2026-09-01T00:00:00.000Z',
                code: 'NCC-01',
                name: 'Công ty ABC',
              }),
        ),
        mswHttp.get(`${BASE}/suppliers/ncc-abc/materials`, () =>
          deleted ? gone(101210) : paginated([], { total: 0 }),
        ),
        mswHttp.get(`${BASE}/suppliers/ncc-abc/transactions`, () =>
          deleted ? gone(101210) : paginated([]),
        ),
        mswHttp.delete(`${BASE}/suppliers/ncc-abc`, () => {
          deleted = true
          return ok('1 supplier have been deleted')
        }),
        mswHttp.get(`${BASE}/suppliers`, () => paginated([])),
        mswHttp.get(`${BASE}/roles`, () => ok([])),
      )
      const { user, router } = renderWithRouter(createRoutes({ dev: false }), {
        route: `/suppliers/ncc-abc?tab=${tab}`,
        auth: 'admin',
        queryClient,
      })
      await screen.findByRole('heading', { level: 1, name: 'NCC-01 · Công ty ABC' })
      await screen.findByRole('tab', { name: 'Vật tư (0)' })

      await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Xoá' }))
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Xoá' }),
      )

      // L1: chờ đã về danh sách và mọi request đang bay xong rồi mới khẳng định "không toast".
      await waitFor(() => expect(router.state.location.pathname).toBe('/suppliers'))
      await waitFor(() => expect(queryClient.isFetching()).toBe(0))
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(queryClient.isFetching()).toBe(0)
      expect(hitsAfterDelete).toBe(0)
      expect(toast.error).not.toHaveBeenCalled()
    },
  )
})
