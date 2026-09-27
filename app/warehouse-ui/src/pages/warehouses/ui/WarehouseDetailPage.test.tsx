import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import type { Warehouse } from '@/entities/warehouse'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import type { InitialEntry } from 'react-router-dom'
import { renderWithRouter, type TestAuth } from '@/shared/test/render'
import { WarehouseDetailPage } from './WarehouseDetailPage'

const BASE = 'http://localhost:8085/api/v1'

const warehouse: Warehouse = {
  slug: 'kho-ha-noi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  name: 'Kho Hà Nội 1',
  code: 'WH-HN-01',
  address: 'Số 1, Cầu Giấy, Hà Nội',
  isActive: true,
}

function renderPage(options: { auth?: TestAuth; route?: InitialEntry } = {}) {
  return renderWithRouter(
    [
      { path: '/warehouses/:slug', element: <WarehouseDetailPage /> },
      { path: '/warehouses', element: <p>DANH SÁCH KHO</p> },
    ],
    { route: options.route ?? '/warehouses/kho-ha-noi', auth: options.auth ?? 'admin' },
  )
}

/** Ô giá trị của một trường trong card, tìm theo nhãn (`<dt>`). */
function field(label: string) {
  return screen.getByText(label, { selector: 'dt' }).parentElement!
}

beforeEach(() => {
  server.use(mswHttp.get(`${BASE}/warehouses/kho-ha-noi`, () => ok(warehouse)))
})

describe('WarehouseDetailPage — hiển thị', () => {
  it('tiêu đề, mã, trạng thái và một card Tổng quan (thời gian ở chân card)', async () => {
    renderPage()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kho Hà Nội 1' }),
    ).toBeInTheDocument()
    expect(within(field('Mã')).getByText('WH-HN-01')).toBeInTheDocument()
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Tổng quan',
    ])
    // Tên đã là tiêu đề trang — không lặp lại trong card.
    expect(screen.getAllByText('Kho Hà Nội 1')).toHaveLength(1)
    expect(within(field('Tạo lúc')).getByText(/01\/09\/2026/)).toBeInTheDocument()
    expect(within(field('Cập nhật lúc')).getByText(/02\/09\/2026/)).toBeInTheDocument()
  })

  it('trường trống hiện "—"; chưa có quản lý hiện "Chưa có quản lý"', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    expect(within(field('Điện thoại')).getByText('—')).toBeInTheDocument()
    expect(within(field('Mô tả')).getByText('—')).toBeInTheDocument()
    expect(within(field('Người quản lý')).getByText('Chưa có quản lý')).toBeInTheDocument()
  })

  it('có số điện thoại → link tel:', async () => {
    server.use(
      mswHttp.get(`${BASE}/warehouses/kho-ha-noi`, () =>
        ok({ ...warehouse, phonenumber: '0901234567' }),
      ),
    )
    renderPage()

    expect(await screen.findByRole('link', { name: '0901234567' })).toHaveAttribute(
      'href',
      'tel:0901234567',
    )
  })

  it('404 → báo không tìm thấy, kèm nút về danh sách', async () => {
    server.use(mswHttp.get(`${BASE}/warehouses/kho-ha-noi`, () => apiError(404, 100501, 'x')))
    const { user } = renderPage()

    expect(
      await screen.findByText('Không tìm thấy kho này — có thể đã bị xoá.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Quay lại danh sách' }))
    expect(await screen.findByText('DANH SÁCH KHO')).toBeInTheDocument()
  })

  it('lỗi khác → báo lỗi + Thử lại tải lại được', async () => {
    let fail = true
    server.use(
      mswHttp.get(`${BASE}/warehouses/kho-ha-noi`, () =>
        fail ? apiError(500, undefined, 'boom') : ok(warehouse),
      ),
    )
    const { user } = renderPage()

    const retry = await screen.findByRole('button', { name: 'Thử lại' })
    fail = false
    await user.click(retry)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kho Hà Nội 1' }),
    ).toBeInTheDocument()
  })
})

describe('WarehouseDetailPage — quay lại và thao tác', () => {
  it('link từ danh sách có state.backTo → quay về đúng trang/bộ lọc cũ', async () => {
    const { router } = renderPage({
      route: { pathname: '/warehouses/kho-ha-noi', state: { backTo: '/warehouses?page=2' } },
    })

    expect(await screen.findByRole('link', { name: 'Quay lại danh sách' })).toHaveAttribute(
      'href',
      '/warehouses?page=2',
    )
    expect(router.state.location.pathname).toBe('/warehouses/kho-ha-noi')
  })

  it('không có quyền ghi (MANAGER, chỉ WAREHOUSE_READ) → không nút Sửa, không menu ⋯', async () => {
    renderPage({
      auth: { userId: 'u', userName: 'm', roleName: 'MANAGER', scope: ['WAREHOUSE_READ'] },
    })
    await screen.findByRole('heading', { level: 1 })

    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thao tác khác' })).not.toBeInTheDocument()
  })

  it('có quyền → Sửa mở form; lưu xong nội dung trang cập nhật tên mới', async () => {
    let name = 'Kho Hà Nội 1'
    server.use(
      mswHttp.get(`${BASE}/warehouses/kho-ha-noi`, () => ok({ ...warehouse, name })),
      mswHttp.patch(`${BASE}/warehouses/kho-ha-noi`, async ({ request }) => {
        name = ((await request.json()) as { name: string }).name
        return ok({ ...warehouse, name })
      }),
    )
    const { user } = renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Kho Hà Nội 1' })

    await user.click(screen.getByRole('button', { name: 'Sửa' }))
    const nameInput = await screen.findByLabelText('Tên', { exact: false })
    await user.clear(nameInput)
    await user.type(nameInput, 'Kho Hà Nội 1B')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kho Hà Nội 1B' }),
    ).toBeInTheDocument()
  })

  it('kho đang hoạt động → mục Xoá khoá kèm lý do', async () => {
    const { user } = renderPage()
    await screen.findByRole('heading', { level: 1 })

    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
    const del = await screen.findByRole('menuitem', { name: 'Xoá' })
    expect(del).toHaveAttribute('data-disabled')
    expect(del).toHaveAttribute('title', 'Phải ngừng hoạt động kho trước khi xoá')
  })

  it('xoá kho đã ngừng hoạt động → về danh sách', async () => {
    server.use(
      mswHttp.get(`${BASE}/warehouses/kho-ha-noi`, () => ok({ ...warehouse, isActive: false })),
      mswHttp.delete(`${BASE}/warehouses/kho-ha-noi`, () => ok('1 warehouse have been deleted')),
    )
    const { user, router } = renderPage()
    await screen.findByRole('heading', { level: 1 })

    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Xoá' }))
    const box = await screen.findByRole('alertdialog')
    await user.click(within(box).getByRole('button', { name: 'Xoá' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/warehouses'))
  })
})
