import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import type { Supplier } from '@/entities/supplier'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders, renderWithRouter } from '@/shared/test/render'
import { SuppliersPage } from './SuppliersPage'

const BASE = 'http://localhost:8085/api/v1'

const supplier: Supplier = {
  slug: 'ncc-abc',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  code: 'NCC-ABC',
  name: 'Công ty ABC',
  taxCode: '0101234567',
}

const ADMIN = {
  userName: 'a',
  roleName: 'ADMIN',
  scope: [
    'SUPPLIER_READ',
    'SUPPLIER_CREATE',
    'SUPPLIER_UPDATE',
    'SUPPLIER_DELETE',
    'MATERIAL_READ',
  ],
}
const MANAGER = { userName: 'm', roleName: 'MANAGER', scope: ['SUPPLIER_READ', 'MATERIAL_READ'] }

function captureQuery(items: Supplier[] = [supplier]) {
  const seen: string[] = []
  server.use(
    mswHttp.get(`${BASE}/suppliers`, ({ request }) => {
      const params = new URL(request.url).searchParams
      seen.push(params.toString())
      return paginated(items, {
        page: Number(params.get('page') ?? 1),
        size: Number(params.get('size') ?? 10),
      })
    }),
  )
  return seen
}

describe('SuppliersPage', () => {
  it('ADMIN: tiêu đề, ô tìm, nút Thêm, dòng dữ liệu; chưa gõ gì → request chỉ page & size', async () => {
    const seen = captureQuery()
    renderWithProviders(<SuppliersPage />, { route: '/suppliers', auth: ADMIN })

    expect(screen.getByRole('heading', { name: 'Nhà cung cấp' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thêm nhà cung cấp' })).toBeInTheDocument()
    expect(await screen.findByText('Công ty ABC')).toBeInTheDocument()
    // Đã có dữ liệu = request đã xong; từ đây mới khẳng định "không có" là đáng tin.
    expect(seen).toEqual(['page=1&size=10'])
    // supplierSearch đã bật (WMS-13) — luật đoán tham số kiểm ở SuppliersPage.sort-search.test.tsx.
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('không có nút sắp xếp ở tiêu đề cột', async () => {
    captureQuery()
    renderWithProviders(<SuppliersPage />, { route: '/suppliers', auth: ADMIN })
    await screen.findByText('Công ty ABC')

    for (const name of ['Mã', 'Tên']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('menu ⋯: ADMIN có Xem chi tiết/Sửa/Xoá; MANAGER chỉ Xem chi tiết và không có nút Thêm', async () => {
    captureQuery()
    const admin = renderWithProviders(<SuppliersPage />, { route: '/suppliers', auth: ADMIN })
    await admin.user.click(await screen.findByRole('button', { name: 'Thao tác với Công ty ABC' }))
    expect(await screen.findByRole('menuitem', { name: 'Xem chi tiết' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Sửa' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Xoá' })).toBeInTheDocument()
    admin.unmount()

    const mgr = renderWithProviders(<SuppliersPage />, { route: '/suppliers', auth: MANAGER })
    await mgr.user.click(await screen.findByRole('button', { name: 'Thao tác với Công ty ABC' }))
    expect(await screen.findByRole('menuitem', { name: 'Xem chi tiết' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Sửa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Xoá' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thêm nhà cung cấp' })).not.toBeInTheDocument()
  })

  it('bấm Thêm mở sheet; bấm Xoá mở hộp xoá', async () => {
    captureQuery()
    const { user } = renderWithProviders(<SuppliersPage />, { route: '/suppliers', auth: ADMIN })

    await user.click(screen.getByRole('button', { name: 'Thêm nhà cung cấp' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(await screen.findByRole('button', { name: 'Thao tác với Công ty ABC' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Xoá' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Xoá nhà cung cấp?')
  })

  it('bấm dòng → điều hướng /suppliers/<slug> kèm state.backTo là URL hiện tại', async () => {
    captureQuery()
    const { user, router } = renderWithRouter(
      [{ path: '/suppliers', element: <SuppliersPage /> }],
      { route: '/suppliers?size=20', auth: ADMIN },
    )

    await user.click(await screen.findByRole('link', { name: 'Công ty ABC' }))

    expect(router.state.location.pathname).toBe('/suppliers/ncc-abc')
    expect(router.state.location.state).toEqual({ backTo: '/suppliers?size=20' })
  })

  it('danh sách rỗng → "Chưa có nhà cung cấp nào."', async () => {
    captureQuery([])
    renderWithProviders(<SuppliersPage />, { route: '/suppliers', auth: ADMIN })

    expect(await screen.findByText('Chưa có nhà cung cấp nào.')).toBeInTheDocument()
  })
})
