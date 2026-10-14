import { screen } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import type { AvailableMaterial, ImportForm } from '@/entities/import-form'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithRouter, type TestAuth } from '@/shared/test/render'
import { ImportFormEditPage } from './ImportFormEditPage'

const flour: AvailableMaterial = {
  slug: 'm-flour',
  code: 'VT-01',
  name: 'Bột mì',
  baseUnitSlug: 'u-kg',
  quantity: 120,
  supplierSlug: 's-1',
  supplierName: 'NCC Bột',
  units: [
    { unitSlug: 'u-kg', unitCode: 'KG', unitName: 'Kilogram', conversionRate: 1, isBaseUnit: true },
    {
      unitSlug: 'u-bag',
      unitCode: 'BAG',
      unitName: 'Bao 25kg',
      conversionRate: 25,
      isBaseUnit: false,
    },
  ],
}

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

const BASE = 'http://localhost:8085/api/v1'
const URL_W = `${BASE}/warehouses/w-a/import-forms`
const ADMIN: TestAuth = {
  userName: 'a',
  userSlug: 'u-a',
  roleName: 'ADMIN',
  scope: ['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'IMPORT_FORM_UPDATE_DRAFT', 'WAREHOUSE_READ'],
}

function renderPage(form = draftForm, route = '/import-forms/if-1/edit?warehouse=w-a') {
  server.use(
    mswHttp.get(`${URL_W}/if-1`, () => ok(form)),
    mswHttp.get(`${URL_W}/available-materials`, () => paginated([flour])),
  )
  return renderWithRouter(
    [
      { path: '/import-forms', element: <p>DANH SÁCH</p> },
      { path: '/import-forms/:slug', element: <p>TRANG CHI TIẾT</p> },
      { path: '/import-forms/:slug/edit', element: <ImportFormEditPage /> },
    ],
    { route, auth: ADMIN },
  )
}

describe('ImportFormEditPage', () => {
  it('DRAFT: hiện form với dữ liệu phiếu', async () => {
    renderPage()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sửa phiếu nhập PN-0001' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^Số hoá đơn/ })).toHaveValue('HD-123')
  })

  it('CONFIRMED → thông báo + link về chi tiết, không có form', async () => {
    renderPage({ ...draftForm, status: 'CONFIRMED' })
    expect(await screen.findByText(/không còn ở trạng thái Nháp/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Về trang chi tiết' })).toHaveAttribute(
      'href',
      '/import-forms/if-1?warehouse=w-a',
    )
    expect(screen.queryByRole('button', { name: 'Lưu nháp' })).not.toBeInTheDocument()
  })

  it('lưu thành công → về chi tiết', async () => {
    server.use(mswHttp.patch(`${URL_W}/if-1`, () => ok({ ...draftForm, version: 4, note: '' })))
    const { user } = renderPage()
    await user.clear(await screen.findByRole('textbox', { name: /^Ghi chú$/ }))
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    expect(await screen.findByText('TRANG CHI TIẾT')).toBeInTheDocument()
  })

  it('409 khi lưu → về chi tiết', async () => {
    server.use(mswHttp.patch(`${URL_W}/if-1`, () => apiError(409, 100800, 'conflict')))
    const { user } = renderPage()
    await user.clear(await screen.findByRole('textbox', { name: /^Ghi chú$/ }))
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    expect(await screen.findByText('TRANG CHI TIẾT')).toBeInTheDocument()
  })

  it('thiếu ?warehouse → về danh sách', async () => {
    renderPage(draftForm, '/import-forms/if-1/edit')
    expect(await screen.findByText('DANH SÁCH')).toBeInTheDocument()
  })
})
