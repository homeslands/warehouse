import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// Ghim hai cờ `storeAbilities` cần — không đọc `BACKEND_SUPPORTS` thật: file đó có thể có thay đổi
// cục bộ chưa commit (`permissionDelegationRules`) mà test không được phụ thuộc vào.
vi.mock('@/shared/api/backend-capabilities', () => ({
  BACKEND_SUPPORTS: { authorityGuards: true, storeAuthorityGuards: true },
}))

import type { Store } from '@/entities/store'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithRouter, type TestAuth } from '@/shared/test/render'
import { StoreDetailPage } from './StoreDetailPage'

const BASE = 'http://localhost:8085/api/v1'

const store: Store = {
  slug: 'ch-ha-noi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  name: 'Cửa hàng Hà Nội 1',
  code: 'ST-HN-01',
  legalName: 'Công ty TNHH ABC',
  taxCode: '0101234567',
  isActive: true,
  warehouseSlug: 'kho-ha-noi',
  warehouseName: 'Kho Hà Nội 1',
}

/** Ô giá trị của một trường trong card, tìm theo nhãn (`<dt>`). */
function field(label: string) {
  return screen.getByText(label, { selector: 'dt' }).parentElement!
}

function renderPage(options: { auth?: TestAuth } = {}) {
  return renderWithRouter(
    [
      { path: '/stores/:slug', element: <StoreDetailPage /> },
      { path: '/stores', element: <p>DANH SÁCH CỬA HÀNG</p> },
      { path: '/warehouses/:slug', element: <p>CHI TIẾT KHO</p> },
    ],
    { route: '/stores/ch-ha-noi', auth: options.auth ?? 'admin' },
  )
}

beforeEach(() => {
  server.use(mswHttp.get(`${BASE}/stores/ch-ha-noi`, () => ok(store)))
})

describe('StoreDetailPage', () => {
  it('tiêu đề, trạng thái và một card Tổng quan có nhóm Pháp nhân & hoá đơn', async () => {
    renderPage()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cửa hàng Hà Nội 1' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Tổng quan',
    ])
    expect(
      screen.getByRole('heading', { level: 3, name: 'Pháp nhân & hoá đơn' }),
    ).toBeInTheDocument()
    expect(within(field('Mã')).getByText('ST-HN-01')).toBeInTheDocument()
    expect(within(field('Tên pháp lý')).getByText('Công ty TNHH ABC')).toBeInTheDocument()
    expect(within(field('Mã số thuế')).getByText('0101234567')).toBeInTheDocument()
    expect(within(field('Tạo lúc')).getByText(/01\/09\/2026/)).toBeInTheDocument()
  })

  it('điện thoại / email → link tel: / mailto:', async () => {
    server.use(
      mswHttp.get(`${BASE}/stores/ch-ha-noi`, () =>
        ok({ ...store, phonenumber: '0901234567', email: 'shop@abc.vn' }),
      ),
    )
    renderPage()

    expect(await screen.findByRole('link', { name: '0901234567' })).toHaveAttribute(
      'href',
      'tel:0901234567',
    )
    expect(screen.getByRole('link', { name: 'shop@abc.vn' })).toHaveAttribute(
      'href',
      'mailto:shop@abc.vn',
    )
  })

  it('kho liên kết là link sang trang chi tiết kho', async () => {
    const { user } = renderPage()

    const link = await screen.findByRole('link', { name: 'Kho Hà Nội 1' })
    expect(link).toHaveAttribute('href', '/warehouses/kho-ha-noi')
    await user.click(link)
    expect(await screen.findByText('CHI TIẾT KHO')).toBeInTheDocument()
  })

  it('có STORE_READ và WAREHOUSE_READ → kho liên kết vẫn là link', async () => {
    renderPage({
      auth: {
        userId: 'u',
        userName: 'm',
        roleName: 'MANAGER',
        scope: ['STORE_READ', 'WAREHOUSE_READ'],
      },
    })

    const link = await screen.findByRole('link', { name: 'Kho Hà Nội 1' })
    expect(link).toHaveAttribute('href', '/warehouses/kho-ha-noi')
  })

  it('chỉ STORE_READ, không có WAREHOUSE_READ → tên kho hiện dạng chữ, không phải link (tránh 403 → /forbidden)', async () => {
    renderPage({ auth: { userId: 'u', userName: 'm', roleName: 'MANAGER', scope: ['STORE_READ'] } })
    await screen.findByRole('heading', { level: 1 })

    const section = field('Kho liên kết')
    expect(within(section).getByText('Kho Hà Nội 1')).toBeInTheDocument()
    expect(within(section).queryByRole('link')).not.toBeInTheDocument()
  })

  it('chưa gán kho → "Chưa gán kho", không có link', async () => {
    server.use(
      mswHttp.get(`${BASE}/stores/ch-ha-noi`, () =>
        ok({ ...store, warehouseSlug: undefined, warehouseName: undefined }),
      ),
    )
    renderPage()

    expect(await screen.findByText('Chưa gán kho')).toBeInTheDocument()
    const section = field('Kho liên kết')
    expect(within(section).queryByRole('link')).not.toBeInTheDocument()
  })

  it('trường tuỳ chọn trống hiện "—"', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    for (const label of ['Điện thoại', 'Email', 'Địa chỉ', 'Địa chỉ xuất hoá đơn'])
      expect(within(field(label)).getByText('—')).toBeInTheDocument()
  })

  it('404 → báo không tìm thấy', async () => {
    server.use(mswHttp.get(`${BASE}/stores/ch-ha-noi`, () => apiError(404, 101001, 'x')))
    renderPage()

    expect(
      await screen.findByText('Không tìm thấy cửa hàng này — có thể đã bị xoá.'),
    ).toBeInTheDocument()
  })

  it('không có quyền ghi (chỉ STORE_READ) → không nút Sửa, không menu ⋯', async () => {
    renderPage({ auth: { userId: 'u', userName: 'm', roleName: 'MANAGER', scope: ['STORE_READ'] } })
    await screen.findByRole('heading', { level: 1 })

    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thao tác khác' })).not.toBeInTheDocument()
  })

  it('có quyền → Sửa mở form; lưu xong nội dung trang cập nhật tên mới, PATCH không có version', async () => {
    let name = 'Cửa hàng Hà Nội 1'
    let body: unknown
    server.use(
      mswHttp.get(`${BASE}/stores/ch-ha-noi`, () => ok({ ...store, name })),
      mswHttp.patch(`${BASE}/stores/ch-ha-noi`, async ({ request }) => {
        body = await request.json()
        name = (body as { name: string }).name
        return ok({ ...store, name })
      }),
    )
    const { user } = renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Cửa hàng Hà Nội 1' })

    // Nút Sửa thấy được với quyền STORE_UPDATE (auth mặc định của renderPage là 'admin').
    await user.click(screen.getByRole('button', { name: 'Sửa' }))
    const nameInput = await screen.findByLabelText(/^Tên(?! pháp)/)
    await user.clear(nameInput)
    await user.type(nameInput, 'Cửa hàng Hà Nội 1B')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cửa hàng Hà Nội 1B' }),
    ).toBeInTheDocument()
    // Cửa hàng không có `version` (WMS-10-be(2)) — PATCH partial không được gửi kèm trường đó.
    expect(body).not.toHaveProperty('version')
  })

  it('xoá cửa hàng đã ngừng hoạt động → về danh sách', async () => {
    server.use(
      mswHttp.get(`${BASE}/stores/ch-ha-noi`, () => ok({ ...store, isActive: false })),
      mswHttp.delete(`${BASE}/stores/ch-ha-noi`, () => ok('1 store have been deleted')),
    )
    const { user, router } = renderPage()
    await screen.findByRole('heading', { level: 1 })

    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Xoá' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Xoá' }),
    )

    await waitFor(() => expect(router.state.location.pathname).toBe('/stores'))
  })
})
