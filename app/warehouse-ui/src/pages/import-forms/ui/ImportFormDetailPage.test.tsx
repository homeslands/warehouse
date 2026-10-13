import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { ImportForm } from '@/entities/import-form'
import type { Warehouse } from '@/entities/warehouse'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithRouter, type TestAuth } from '@/shared/test/render'
import { ImportFormDetailPage } from './ImportFormDetailPage'

const BASE = 'http://localhost:8085/api/v1'
const kho = { slug: 'w-a', code: 'KHO-A', name: 'Kho A', isActive: true } as Warehouse

const draftForm: ImportForm = {
  slug: 'if-1',
  createdAt: '2026-10-12T02:00:00.000Z',
  updatedAt: '2026-10-12T02:00:00.000Z',
  version: 3,
  code: 'PN-0001',
  purchaseOrder: 'PO-12',
  invoiceCode: 'HD-123',
  requesterSlug: 'u-sup',
  requesterName: 'Nguyễn Văn A',
  approverSlug: null,
  approverName: null,
  date: '2026-10-12',
  total: 3_750_000,
  file: 'hoa-don-1760000000000.pdf',
  note: 'Giao buổi sáng',
  status: 'DRAFT',
  warehouseSlug: 'w-a',
  items: [
    {
      slug: 'it-1',
      createdAt: '',
      updatedAt: '',
      lineNo: 1,
      materialSlug: 'm-flour',
      materialCode: 'VT-01',
      materialName: 'Bột mì',
      unitSlug: 'u-bag',
      unitCode: 'BAG',
      unitName: 'Bao 25kg',
      supplierSlug: 's-1',
      supplierCode: 'NCC-01',
      supplierName: 'NCC Bột',
      supplierTaxCode: '0101',
      supplierAddress: 'Hà Nội',
      quantity: 10,
      conversionRate: 25,
      baseQuantity: 250,
      unitPrice: 375_000,
      amount: 3_750_000,
      note: null,
    },
  ],
}

const MANAGER: TestAuth = {
  userName: 'm',
  userSlug: 'u-mgr',
  roleName: 'MANAGER',
  scope: [
    'IMPORT_FORM_READ',
    'WAREHOUSE_READ',
    'IMPORT_FORM_UPDATE_DRAFT',
    'IMPORT_FORM_DELETE_DRAFT',
    'IMPORT_FORM_CONFIRM',
    'IMPORT_FORM_EXPORT',
  ],
}

function renderPage(
  route = '/import-forms/if-1?warehouse=w-a',
  auth: TestAuth = MANAGER,
  form = draftForm,
) {
  const getWarehouse = vi.fn(() => ok(kho))
  server.use(
    mswHttp.get(`${BASE}/warehouses/w-a`, getWarehouse),
    mswHttp.get(`${BASE}/warehouses/w-a/import-forms/if-1`, () => ok(form)),
  )
  const r = renderWithRouter(
    [
      { path: '/import-forms', element: <p>DANH SÁCH</p> },
      { path: '/import-forms/:slug', element: <ImportFormDetailPage /> },
      { path: '/import-forms/:slug/edit', element: <p>TRANG SỬA</p> },
    ],
    { route, auth },
  )
  return { ...r, getWarehouse }
}

describe('ImportFormDetailPage', () => {
  it('hiện tổng quan, dòng (NCC snapshot, quy đổi), tên file dễ đọc', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: /PN-0001/ })).toBeInTheDocument()
    expect(screen.getAllByText('Nháp').length).toBeGreaterThan(0)
    expect(screen.getAllByText('NCC Bột').length).toBeGreaterThan(0)
    // Phiếu không có dòng 1:1 của Bột mì → không biết mã đơn vị gốc, chỉ hiện số (xem Step 4).
    expect(screen.getAllByText(/^= 250/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('hoa-don.pdf').length).toBeGreaterThan(0)
  })

  it('DRAFT + đủ quyền: Xác nhận, Sửa, menu thao tác khác (Huỷ, Xoá, In)', async () => {
    const { user } = renderPage()
    expect(await screen.findByRole('button', { name: 'Xác nhận phiếu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
    expect(await screen.findByRole('menuitem', { name: 'Huỷ phiếu' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Xoá phiếu nháp' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'In phiếu' })).toBeInTheDocument()
  })

  it('CONFIRMED: chỉ còn nút In, hiện người xác nhận', async () => {
    renderPage(undefined, MANAGER, {
      ...draftForm,
      status: 'CONFIRMED',
      approverSlug: 'u-mgr',
      approverName: 'Trần B',
    })
    expect(await screen.findByRole('button', { name: 'In phiếu' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xác nhận phiếu' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument()
    expect(screen.getAllByText('Người xác nhận').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Trần B').length).toBeGreaterThan(0)
  })

  it('In gọi window.print', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const { user } = renderPage(undefined, MANAGER, { ...draftForm, status: 'CANCELLED' })
    await user.click(await screen.findByRole('button', { name: 'In phiếu' }))
    expect(print).toHaveBeenCalled()
  })

  it('SUPERVISOR chỉ _OWN, phiếu người khác: không Sửa / Xoá', async () => {
    renderPage(undefined, {
      userName: 's',
      userSlug: 'u-other',
      roleName: 'SUPERVISOR',
      scope: [
        'IMPORT_FORM_READ',
        'WAREHOUSE_READ',
        'IMPORT_FORM_UPDATE_DRAFT_OWN',
        'IMPORT_FORM_DELETE_DRAFT_OWN',
      ],
    })
    await screen.findByRole('heading', { level: 1, name: /PN-0001/ })
    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xoá phiếu nháp' })).not.toBeInTheDocument()
  })

  it('404 → câu "Không tìm thấy phiếu nhập"', async () => {
    server.use(
      mswHttp.get(`${BASE}/warehouses/w-a`, () => ok(kho)),
      mswHttp.get(`${BASE}/warehouses/w-a/import-forms/if-1`, () => apiError(404, 101301, 'nf')),
    )
    renderWithRouter([{ path: '/import-forms/:slug', element: <ImportFormDetailPage /> }], {
      route: '/import-forms/if-1?warehouse=w-a',
      auth: MANAGER,
    })
    expect(
      await screen.findByText('Không tìm thấy phiếu nhập (có thể đã bị xoá).'),
    ).toBeInTheDocument()
  })

  it('thiếu ?warehouse → về danh sách, không gọi API kho', async () => {
    const { getWarehouse } = renderPage('/import-forms/if-1')
    expect(await screen.findByText('DANH SÁCH')).toBeInTheDocument()
    await waitFor(() => expect(getWarehouse).not.toHaveBeenCalled())
  })
  it.each(['DRAFT', 'CANCELLED'] as const)(
    'bản in %s: có nhãn "chưa có giá trị", ẩn/hiện đúng class',
    async (status) => {
      renderPage(undefined, MANAGER, { ...draftForm, status })
      await screen.findByRole('heading', { level: 1, name: /PN-0001/ })
      const printRoot = screen.getByText('PHIẾU NHẬP KHO').parentElement as HTMLElement
      expect(printRoot).toHaveClass('hidden', 'print:block')
      expect(within(printRoot).getByText(/chưa có giá trị nhập kho/)).toBeInTheDocument()
      const screenRoot = screen
        .getByRole('heading', { level: 1, name: /PN-0001/ })
        .closest('.print\\:hidden')
      expect(screenRoot).not.toBeNull()
    },
  )

  it('bản in CONFIRMED: không có nhãn "chưa có giá trị"', async () => {
    renderPage(undefined, MANAGER, { ...draftForm, status: 'CONFIRMED' })
    await screen.findByRole('heading', { level: 1, name: /PN-0001/ })
    expect(screen.getByText('PHIẾU NHẬP KHO')).toBeInTheDocument()
    expect(screen.queryByText(/chưa có giá trị nhập kho/)).not.toBeInTheDocument()
  })

  it('xoá từ trang chi tiết → về danh sách', async () => {
    const del = vi.fn(() => ok('1 import form have been deleted successfully'))
    const { user } = renderPage()
    server.use(mswHttp.delete(`${BASE}/warehouses/w-a/import-forms/if-1`, del))
    await user.click(await screen.findByRole('button', { name: 'Thao tác khác' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Xoá phiếu nháp' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Xoá' }))
    expect(await screen.findByText('DANH SÁCH')).toBeInTheDocument()
    expect(del).toHaveBeenCalled()
  })

  it('CANCELLED: nhãn "Người huỷ" và tên người huỷ', async () => {
    renderPage(undefined, MANAGER, {
      ...draftForm,
      status: 'CANCELLED',
      approverSlug: 'u-x',
      approverName: 'Lê C',
    })
    expect((await screen.findAllByText('Người huỷ')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Lê C').length).toBeGreaterThan(0)
  })

  it('bấm Xác nhận phiếu → mở hộp xác nhận', async () => {
    const { user } = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Xác nhận phiếu' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/Xác nhận phiếu nhập PN-0001/)).toBeInTheDocument()
  })
})
