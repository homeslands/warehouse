import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// Tab Giao dịch nằm sau cờ `supplierTransactions` (mặc định TẮT — WMS-13 tạm ẩn API). Bật cho các test cũ để
// phần dựng sẵn vẫn được chạy; vài test tắt lại để kiểm trang khi chưa có API.
const flags = vi.hoisted(() => ({ supplierTransactions: true }))
vi.mock('@/shared/api/backend-capabilities', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/shared/api/backend-capabilities')>()
  return {
    ...mod,
    BACKEND_SUPPORTS: {
      ...mod.BACKEND_SUPPORTS,
      get supplierTransactions() {
        return flags.supplierTransactions
      },
    },
  }
})

import type { Supplier } from '@/entities/supplier'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithRouter, type TestAuth } from '@/shared/test/render'
import { SupplierDetailPage } from './SupplierDetailPage'

const BASE = 'http://localhost:8085/api/v1'

const supplier: Supplier = {
  slug: 'ncc-abc',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  code: 'NCC-HN-01',
  name: 'Công ty ABC',
  taxCode: '0101234567',
  phonenumber: '0901234567',
  email: 'ncc@abc.vn',
  address: '1 Phố Huế, Hà Nội',
  contactPerson: 'Nguyễn Văn A',
  note: 'Giao hàng buổi sáng',
}

const ADMIN: TestAuth = {
  userName: 'a',
  roleName: 'ADMIN',
  scope: [
    'SUPPLIER_READ',
    'SUPPLIER_CREATE',
    'SUPPLIER_UPDATE',
    'SUPPLIER_DELETE',
    'MATERIAL_READ',
    'MATERIAL_UPDATE',
  ],
}
const READ_ONLY: TestAuth = { userName: 'm', roleName: 'MANAGER', scope: ['SUPPLIER_READ'] }

const material = {
  slug: 'm-1',
  createdAt: '',
  updatedAt: '',
  code: 'NL04',
  name: 'Bột giặt',
  typeName: 'Hoá chất',
  baseUnitName: 'kg',
}

function mockApi(materialsTotal = 3, sup: Supplier = supplier) {
  server.use(
    mswHttp.get(`${BASE}/suppliers/ncc-abc`, () => ok(sup)),
    mswHttp.get(`${BASE}/suppliers/ncc-abc/materials`, () =>
      paginated(materialsTotal ? [material] : [], { total: materialsTotal }),
    ),
    mswHttp.get(`${BASE}/suppliers/ncc-abc/transactions`, () => paginated([])),
    mswHttp.get(`${BASE}/materials`, () => paginated([])),
  )
}

function field(label: string) {
  return screen.getByText(label, { selector: 'dt' }).parentElement!
}

function renderPage(options: { auth?: TestAuth; route?: string } = {}) {
  return renderWithRouter(
    [
      { path: '/suppliers/:slug', element: <SupplierDetailPage /> },
      { path: '/suppliers', element: <p>DANH SÁCH NCC</p> },
    ],
    { route: options.route ?? '/suppliers/ncc-abc', auth: options.auth ?? ADMIN },
  )
}

beforeEach(() => {
  flags.supplierTransactions = true
  mockApi()
})

describe('SupplierDetailPage', () => {
  it('thẻ hồ sơ: tiêu đề, các trường, link tel/mailto, footer', async () => {
    renderPage()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'NCC-HN-01 · Công ty ABC' }),
    ).toBeInTheDocument()
    expect(within(field('Mã số thuế')).getByText('0101234567')).toBeInTheDocument()
    expect(within(field('Điện thoại')).getByRole('link')).toHaveAttribute('href', 'tel:0901234567')
    expect(within(field('Email')).getByRole('link')).toHaveAttribute('href', 'mailto:ncc@abc.vn')
    expect(within(field('Địa chỉ')).getByText('1 Phố Huế, Hà Nội')).toBeInTheDocument()
    expect(within(field('Người liên hệ')).getByText('Nguyễn Văn A')).toBeInTheDocument()
    expect(within(field('Ghi chú')).getByText('Giao hàng buổi sáng')).toBeInTheDocument()
    expect(within(field('Tạo lúc')).getByText(/01\/09\/2026/)).toBeInTheDocument()
    expect(within(field('Cập nhật lúc')).getByText(/02\/09\/2026/)).toBeInTheDocument()
  })

  it('trường tuỳ chọn trống hiện "Chưa có"', async () => {
    // Backend trả `null` (không phải thiếu khoá) cho trường chưa nhập — vd `taxCode: null` trên sandbox.
    mockApi(3, {
      ...supplier,
      taxCode: null,
      phonenumber: undefined,
      email: undefined,
      note: undefined,
    })
    renderPage()
    await screen.findByRole('heading', { level: 1 })

    for (const label of ['Mã số thuế', 'Điện thoại', 'Email', 'Ghi chú'])
      expect(within(field(label)).getByText('Chưa có')).toBeInTheDocument()
  })

  it('tab mặc định Vật tư kèm tổng; bấm Giao dịch → ?tab=transactions (replace)', async () => {
    const { user, router } = renderPage()

    expect(
      await screen.findByRole('tab', { name: 'Vật tư (3)', selected: true }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Bột giặt')).toBeInTheDocument()
    const historyLength = window.history.length

    await user.click(screen.getByRole('tab', { name: 'Giao dịch' }))

    await waitFor(() => expect(router.state.location.search).toBe('?tab=transactions'))
    expect(screen.getByRole('tab', { name: 'Giao dịch', selected: true })).toBeInTheDocument()
    expect(window.history.length).toBe(historyLength)
  })

  it('?tab=xyz → rơi về tab Vật tư; chỉ SUPPLIER_READ → không có tab Vật tư, hiện Giao dịch', async () => {
    const first = renderPage({ route: '/suppliers/ncc-abc?tab=xyz' })
    expect(await screen.findByRole('tab', { name: /^Vật tư/, selected: true })).toBeInTheDocument()
    first.unmount()

    renderPage({ auth: READ_ONLY, route: '/suppliers/ncc-abc?tab=materials' })
    expect(
      await screen.findByRole('tab', { name: 'Giao dịch', selected: true }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /^Vật tư/ })).not.toBeInTheDocument()
  })

  it('cờ supplierTransactions tắt: không có tab Giao dịch, ?tab=transactions rơi về Vật tư, không gọi API giao dịch', async () => {
    flags.supplierTransactions = false
    let transactionHits = 0
    server.use(
      mswHttp.get(`${BASE}/suppliers/ncc-abc/transactions`, () => {
        transactionHits += 1
        return paginated([])
      }),
    )
    renderPage({ route: '/suppliers/ncc-abc?tab=transactions' })

    expect(
      await screen.findByRole('tab', { name: 'Vật tư (3)', selected: true }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Giao dịch' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ghi giao dịch' })).not.toBeInTheDocument()
    expect(transactionHits).toBe(0)
  })

  it('cờ tắt + thiếu MATERIAL_READ: không còn tab nào, chỉ thẻ hồ sơ', async () => {
    flags.supplierTransactions = false
    renderPage({ auth: READ_ONLY })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'NCC-HN-01 · Công ty ABC' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('ADMIN: Sửa mở sheet sửa', async () => {
    const { user } = renderPage()
    await screen.findByRole('heading', { level: 1 })

    await user.click(screen.getByRole('button', { name: 'Sửa' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Công ty ABC')).toBeInTheDocument()
  })

  it('Xoá bị khoá khi tab Vật tư báo tổng > 0 (Review Focus #5)', async () => {
    const { user } = renderPage()
    await screen.findByRole('tab', { name: 'Vật tư (3)' })

    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
    const item = await screen.findByRole('menuitem', { name: 'Xoá' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(item).toHaveAttribute('title', 'Còn vật tư đang gắn — gỡ hết ở tab Vật tư trước')
  })

  it('tổng 0 → Xoá mở hộp xác nhận; xoá xong về backTo (replace) và gỡ cache chi tiết', async () => {
    mockApi(0)
    server.use(
      mswHttp.delete(`${BASE}/suppliers/ncc-abc`, () => ok('1 supplier have been deleted')),
    )
    const { user, router, queryClient } = renderPage()
    await screen.findByRole('tab', { name: 'Vật tư (0)' })

    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
    const item = await screen.findByRole('menuitem', { name: 'Xoá' })
    expect(item).not.toHaveAttribute('aria-disabled', 'true')
    await user.click(item)
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Xoá' }),
    )

    await waitFor(() => expect(router.state.location.pathname).toBe('/suppliers'))
    expect(queryClient.getQueryData(['suppliers', 'detail', 'ncc-abc'])).toBeUndefined()
  })

  it('mở thẳng ?tab=transactions vẫn biết tổng vật tư: nhãn tab + khoá Xoá; đổi :slug theo tổng mới (F2)', async () => {
    mockApi(2)
    server.use(
      mswHttp.get(`${BASE}/suppliers/ncc-xyz`, () =>
        ok({ ...supplier, slug: 'ncc-xyz', code: 'NCC-XYZ', name: 'Công ty XYZ' }),
      ),
      mswHttp.get(`${BASE}/suppliers/ncc-xyz/materials`, () => paginated([], { total: 0 })),
      mswHttp.get(`${BASE}/suppliers/ncc-xyz/transactions`, () => paginated([])),
    )
    const { user, router } = renderPage({ route: '/suppliers/ncc-abc?tab=transactions' })

    expect(await screen.findByRole('tab', { name: 'Vật tư (2)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Giao dịch', selected: true })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
    expect(await screen.findByRole('menuitem', { name: 'Xoá' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await user.keyboard('{Escape}')

    await router.navigate('/suppliers/ncc-xyz?tab=transactions')

    expect(await screen.findByRole('tab', { name: 'Vật tư (0)' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
    expect(await screen.findByRole('menuitem', { name: 'Xoá' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('thiếu MATERIAL_READ → không biết tổng, Xoá KHÔNG bị khoá', async () => {
    const { user } = renderPage({
      auth: { userName: 'a', roleName: 'ADMIN', scope: ['SUPPLIER_READ', 'SUPPLIER_DELETE'] },
    })
    await screen.findByRole('heading', { level: 1 })

    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
    const item = await screen.findByRole('menuitem', { name: 'Xoá' })
    expect(item).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('404 → "Không tìm thấy nhà cung cấp" + link về danh sách', async () => {
    server.use(mswHttp.get(`${BASE}/suppliers/ncc-abc`, () => apiError(404, 101210, 'x')))
    renderPage()

    expect(await screen.findByText('Không tìm thấy nhà cung cấp')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Quay lại danh sách' })).toHaveAttribute(
      'href',
      '/suppliers',
    )
  })

  it('500 → câu lỗi + Thử lại', async () => {
    server.use(mswHttp.get(`${BASE}/suppliers/ncc-abc`, () => apiError(500, 1, 'boom')))
    renderPage()

    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
    expect(screen.queryByText('Không tìm thấy nhà cung cấp')).not.toBeInTheDocument()
  })

  it('form giao dịch: "Mở tab Vật tư" → ?tab=materials', async () => {
    mockApi(0)
    const { user, router } = renderPage({ route: '/suppliers/ncc-abc?tab=transactions' })

    await user.click(await screen.findByRole('button', { name: 'Ghi giao dịch' }))
    await user.click(await screen.findByRole('button', { name: 'Mở tab Vật tư' }))

    await waitFor(() => expect(router.state.location.search).toBe('?tab=materials'))
  })
})
