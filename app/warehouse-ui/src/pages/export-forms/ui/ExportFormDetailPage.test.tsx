import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExportForm, ExportFormItem } from '@/entities/export-form'
import type { Warehouse } from '@/entities/warehouse'
import { apiError, ok, paginated } from '@/shared/test/api'
import { confirmDialog } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithRouter, type TestAuth } from '@/shared/test/render'
import { ExportFormDetailPage } from './ExportFormDetailPage'

const BASE = 'http://localhost:8085/api/v1'
const URL_FORM = `${BASE}/warehouses/w-a/export-forms/xf-1`
const kho = { slug: 'w-a', code: 'KHO-A', name: 'Kho A', isActive: true } as Warehouse

// Dữ liệu giả — chép từ `@/entities/export-form/model/fixtures` (deep import bị `boundaries/entry-point` chặn).
const item = (overrides: Partial<ExportFormItem> = {}): ExportFormItem => ({
  slug: 'xit-1',
  createdAt: '2026-10-26T02:00:00.000Z',
  updatedAt: '2026-10-26T02:00:00.000Z',
  lineNo: 1,
  materialSlug: 'm-flour',
  materialCode: 'VT-01',
  materialName: 'Bột mì',
  unitSlug: 'u-kg',
  unitCode: 'KG',
  unitName: 'Kilogram',
  batchSlug: null,
  batchExpiryDate: null,
  quantity: 10,
  conversionRate: 1,
  baseQuantity: 10,
  unitPrice: 0,
  amount: 0,
  note: null,
  ...overrides,
})
const draftForm: ExportForm = {
  slug: 'xf-1',
  createdAt: '2026-10-26T02:00:00.000Z',
  updatedAt: '2026-10-26T02:00:00.000Z',
  version: 3,
  code: 'PX-0001',
  type: 'PRODUCTION',
  status: 'DRAFT',
  purchaseOrder: 'PO-12',
  invoiceCode: 'HD-123',
  requesterSlug: 'u-sup',
  requesterName: 'Nguyễn Văn A',
  approverSlug: null,
  approverName: null,
  receiver: 'Xưởng 1',
  totalAmount: 0,
  note: 'Giao buổi sáng',
  file: 'chung-tu-1760000000000.pdf',
  warehouseSlug: 'w-a',
  items: [item()],
}

/** Sau gửi duyệt BE tách dòng 1 (15 KG Bột mì) thành 2 dòng cùng vật tư khác lô (FEFO), đánh lại lineNo. */
const splitForm: ExportForm = {
  ...draftForm,
  status: 'PENDING',
  items: [
    item({
      slug: 'xit-1',
      lineNo: 1,
      quantity: 10,
      baseQuantity: 10,
      batchSlug: 'b-1',
      batchExpiryDate: '2026-11-30',
    }),
    item({ slug: 'xit-2', lineNo: 2, quantity: 5, baseQuantity: 5, batchSlug: 'b-2' }),
  ],
}

const SUPERVISOR: TestAuth = {
  userName: 's',
  userSlug: 'u-sup',
  roleName: 'SUPERVISOR',
  scope: [
    'EXPORT_FORM_READ',
    'EXPORT_FORM_CREATE',
    'EXPORT_FORM_UPDATE_DRAFT_OWN',
    'EXPORT_FORM_DELETE_DRAFT_OWN',
    'EXPORT_FORM_EXPORT',
    'WAREHOUSE_READ',
    'MATERIAL_READ',
  ],
}
const MANAGER: TestAuth = {
  userName: 'm',
  userSlug: 'u-mgr',
  roleName: 'MANAGER',
  scope: [
    'EXPORT_FORM_READ',
    'EXPORT_FORM_DELETE_DRAFT',
    'EXPORT_FORM_CONFIRM',
    'EXPORT_FORM_APPROVE_DISPOSAL',
    'EXPORT_FORM_EXPORT',
    'WAREHOUSE_READ',
  ],
}
const ADMIN: TestAuth = {
  userName: 'a',
  userSlug: 'u-adm',
  roleName: 'ADMIN',
  scope: [...(MANAGER as { scope: string[] }).scope, 'EXPORT_FORM_UPDATE_DRAFT', 'MATERIAL_READ'],
}

function renderPage(
  form: ExportForm = draftForm,
  auth: TestAuth = SUPERVISOR,
  route = '/export-forms/xf-1?warehouse=w-a',
  formResponse: () => Response = () => ok(form),
) {
  const getWarehouse = vi.fn(() => ok(kho))
  server.use(
    mswHttp.get(`${BASE}/warehouses/w-a`, getWarehouse),
    mswHttp.get(URL_FORM, formResponse),
    mswHttp.get(`${BASE}/warehouses/w-a/materials`, () => paginated([], { size: 500 })),
    mswHttp.get(`${BASE}/warehouses/w-a/material-batches`, () => paginated([])),
  )
  const r = renderWithRouter(
    [
      { path: '/export-forms', element: <p>DANH SÁCH</p> },
      { path: '/export-forms/:slug', element: <ExportFormDetailPage /> },
    ],
    { route, auth },
  )
  return { ...r, getWarehouse }
}

const heading = () => screen.findByRole('heading', { level: 1, name: /PX-0001/ })
/** Bảng dòng trên màn (không phải bản sao trong khung in). */
const screenItems = () =>
  within(screen.getByRole('region', { name: 'Chi tiết vật tư' })).getByRole('table')

afterEach(() => vi.restoreAllMocks())

describe('ExportFormDetailPage', () => {
  it('hiện thông tin phiếu: lý do, người nhận, PO, số HĐ, người lập, ghi chú, tên file dễ đọc', async () => {
    renderPage()
    const main = (await heading()).closest('.print\\:hidden') as HTMLElement
    const q = within(main)
    expect(q.getAllByText('Nháp').length).toBeGreaterThan(0)
    expect(q.getByText('Sản xuất')).toBeInTheDocument()
    expect(q.getByText('Xưởng 1')).toBeInTheDocument()
    expect(q.getByText('PO-12')).toBeInTheDocument()
    expect(q.getByText('HD-123')).toBeInTheDocument()
    expect(q.getByText('Nguyễn Văn A')).toBeInTheDocument()
    expect(q.getByText('Giao buổi sáng')).toBeInTheDocument()
    expect(q.getByText('chung-tu.pdf')).toBeInTheDocument()
    expect(q.getByText('KHO-A · Kho A')).toBeInTheDocument()
  })

  it('file là URL S3 đầy đủ → hiện tên dễ đọc, không hiện nguyên link', async () => {
    renderPage({
      ...draftForm,
      file: 'https://bucket.s3.ap-southeast-1.amazonaws.com/export/chung-tu-1760000000000.pdf',
    })
    const main = (await heading()).closest('.print\\:hidden') as HTMLElement
    expect(within(main).getByText('chung-tu.pdf')).toBeInTheDocument()
    expect(within(main).queryByText(/amazonaws/)).not.toBeInTheDocument()
  })

  it('Review Focus 1: phiếu BE đã tách 1 dòng thành 2 dòng cùng vật tư khác lô → hiện đủ cả 2 dòng, không báo trùng', async () => {
    renderPage(splitForm, MANAGER)
    await heading()
    const rows = within(screenItems())
      .getAllByRole('row')
      .filter((r) => r.closest('tbody'))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('VT-01 · Bột mì')
    expect(rows[1]).toHaveTextContent('VT-01 · Bột mì')
    expect(rows[0]).toHaveTextContent('HSD 30/11/2026')
    expect(rows[1]).toHaveTextContent('Lô không hạn')
    expect(screen.queryByText(/đã có ở dòng khác/)).not.toBeInTheDocument()
    // Bản in cũng đủ 2 dòng.
    const print = screen.getByTestId('export-form-print')
    const printRows = within(print)
      .getAllByRole('row')
      .filter((r) => r.closest('tbody'))
    expect(printRows).toHaveLength(2)
    expect(printRows[1]).toHaveTextContent('VT-01 · Bột mì')
  })

  it('cột Lô: dòng nháp chưa chọn lô → "Tự chọn khi gửi duyệt"', async () => {
    renderPage()
    await heading()
    expect(within(screenItems()).getByText('Tự chọn khi gửi duyệt')).toBeInTheDocument()
  })

  it('giá chỉ hiện với lý do Bán: SALE có Đơn giá / Thành tiền / Tổng tiền, PRODUCTION thì không', async () => {
    renderPage()
    await heading()
    expect(within(screenItems()).queryByText('Đơn giá')).not.toBeInTheDocument()
    expect(within(screenItems()).queryByText('Thành tiền')).not.toBeInTheDocument()
  })

  it('SALE: bảng dòng có Đơn giá / Thành tiền và tổng', async () => {
    renderPage({
      ...draftForm,
      type: 'SALE',
      totalAmount: 200_000,
      items: [item({ unitPrice: 20_000, amount: 200_000 })],
    })
    await heading()
    const table = within(screenItems())
    expect(table.getByText('Đơn giá')).toBeInTheDocument()
    expect(table.getByText('Thành tiền')).toBeInTheDocument()
    expect(table.getAllByText(/200\.000/).length).toBeGreaterThan(0)
  })

  it('DRAFT, SUPERVISOR chủ phiếu: Gửi duyệt, Sửa, Xoá, In — không có Huỷ', async () => {
    const { user } = renderPage()
    expect(await screen.findByRole('button', { name: 'Gửi duyệt' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
    expect(await screen.findByRole('menuitem', { name: 'Xoá phiếu nháp' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'In phiếu' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Huỷ phiếu' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xác nhận phiếu' })).not.toBeInTheDocument()
  })

  it('DRAFT, ADMIN: Gửi duyệt, Sửa + menu Huỷ, Xoá, In', async () => {
    const { user } = renderPage(draftForm, ADMIN)
    expect(await screen.findByRole('button', { name: 'Gửi duyệt' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
    expect(await screen.findByRole('menuitem', { name: 'Huỷ phiếu' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Xoá phiếu nháp' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'In phiếu' })).toBeInTheDocument()
  })

  it('PENDING, MANAGER: Xác nhận phiếu + Huỷ, không Sửa / Gửi duyệt / Xoá', async () => {
    const { user } = renderPage({ ...draftForm, status: 'PENDING' }, MANAGER)
    expect(await screen.findByRole('button', { name: 'Xác nhận phiếu' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi duyệt' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Thao tác khác' }))
    expect(await screen.findByRole('menuitem', { name: 'Huỷ phiếu' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'In phiếu' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Xoá phiếu nháp' })).not.toBeInTheDocument()
  })

  it('PENDING Xuất huỷ, có CONFIRM nhưng thiếu APPROVE_DISPOSAL → nút Xác nhận khoá kèm lý do', async () => {
    renderPage(
      { ...draftForm, status: 'PENDING', type: 'DISPOSAL' },
      {
        ...MANAGER,
        scope: (MANAGER as { scope: string[] }).scope.filter(
          (c) => c !== 'EXPORT_FORM_APPROVE_DISPOSAL',
        ),
      },
    )
    const confirm = await screen.findByRole('button', { name: 'Xác nhận phiếu' })
    expect(confirm).toBeDisabled()
    expect(confirm).toHaveAccessibleDescription('Cần quyền phê duyệt phiếu xuất huỷ')
  })

  it.each(['CONFIRMED', 'CANCELLED'] as const)('%s: chỉ còn nút In', async (status) => {
    renderPage({ ...draftForm, status, approverSlug: 'u-mgr', approverName: 'Trần B' }, ADMIN)
    expect(await screen.findByRole('button', { name: 'In phiếu' })).toBeInTheDocument()
    for (const name of ['Xác nhận phiếu', 'Sửa', 'Gửi duyệt', 'Thao tác khác', 'Huỷ phiếu'])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    expect(
      screen.getAllByText(status === 'CONFIRMED' ? 'Người xác nhận' : 'Người huỷ').length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('Trần B').length).toBeGreaterThan(0)
  })

  it('In gọi window.print', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const { user } = renderPage({ ...draftForm, status: 'CONFIRMED' }, ADMIN)
    await user.click(await screen.findByRole('button', { name: 'In phiếu' }))
    expect(print).toHaveBeenCalled()
  })

  it('bấm Gửi duyệt → mở hộp gửi duyệt', async () => {
    const { user } = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Gửi duyệt' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Gửi duyệt phiếu xuất PX-0001?')).toBeInTheDocument()
  })

  it('bấm Xác nhận phiếu → mở hộp xác nhận', async () => {
    const { user } = renderPage({ ...draftForm, status: 'PENDING' }, MANAGER)
    await user.click(await screen.findByRole('button', { name: 'Xác nhận phiếu' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Xác nhận xuất kho phiếu PX-0001?')).toBeInTheDocument()
  })

  it('Huỷ từ menu → mở hộp huỷ', async () => {
    const { user } = renderPage({ ...draftForm, status: 'PENDING' }, MANAGER)
    await user.click(await screen.findByRole('button', { name: 'Thao tác khác' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Huỷ phiếu' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Huỷ phiếu xuất PX-0001?')).toBeInTheDocument()
  })

  it('xoá từ trang chi tiết → về danh sách', async () => {
    const del = vi.fn(() => ok('1 export form have been deleted successfully'))
    const { user } = renderPage()
    server.use(mswHttp.delete(URL_FORM, del))
    await user.click(await screen.findByRole('button', { name: 'Thao tác khác' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Xoá phiếu nháp' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Xoá' }))
    expect(await screen.findByText('DANH SÁCH')).toBeInTheDocument()
    expect(del).toHaveBeenCalled()
  })

  it('bấm Sửa → mở sheet sửa ngay trên trang, Lưu xong toast "Đã lưu PX-0001"', async () => {
    let saved = false
    server.use(
      mswHttp.patch(URL_FORM, () => {
        saved = true
        return ok({ ...draftForm, version: 4 })
      }),
    )
    const spy = vi.spyOn(toast, 'success').mockImplementation(() => 'id')
    const { user, router } = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Sửa' }))
    const sheet = await screen.findByRole('dialog', { name: 'Sửa phiếu xuất PX-0001' })
    expect(router.state.location.pathname).toBe('/export-forms/xf-1')
    const qty = await within(sheet).findByRole('textbox', { name: 'Số lượng dòng 1' })
    await waitFor(() => expect(qty).toHaveValue('10'))
    await user.clear(qty)
    await user.type(qty, '7')
    await user.click(within(sheet).getByRole('button', { name: 'Lưu' }))
    await confirmDialog(user, 'Lưu thay đổi')
    await waitFor(() => expect(saved).toBe(true))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('Đã lưu PX-0001')
  })

  it('SUPERVISOR, nháp người khác: không Sửa / Gửi duyệt / Xoá', async () => {
    renderPage({ ...draftForm, requesterSlug: 'u-other' })
    await heading()
    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi duyệt' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xoá phiếu nháp' })).not.toBeInTheDocument()
  })

  it('bản in: tiêu đề "PHIẾU XUẤT KHO", có cột Lô, nháp có nhãn "chưa có giá trị"', async () => {
    renderPage()
    await heading()
    const print = screen.getByTestId('export-form-print')
    expect(print).toHaveClass('hidden', 'print:block')
    expect(within(print).getByText('PHIẾU XUẤT KHO')).toBeInTheDocument()
    expect(within(print).getByRole('columnheader', { name: 'Lô' })).toBeInTheDocument()
    expect(within(print).getByText(/chưa có giá trị xuất kho/)).toBeInTheDocument()
  })

  it('bản in CONFIRMED: không có nhãn "chưa có giá trị"', async () => {
    renderPage({ ...draftForm, status: 'CONFIRMED' }, ADMIN)
    await heading()
    expect(screen.queryByText(/chưa có giá trị xuất kho/)).not.toBeInTheDocument()
  })

  it('404 → câu "Không tìm thấy phiếu xuất"', async () => {
    renderPage(draftForm, SUPERVISOR, undefined, () => apiError(404, 101401, 'nf'))
    expect(
      await screen.findByText('Không tìm thấy phiếu xuất (có thể đã bị xoá).'),
    ).toBeInTheDocument()
  })

  it('thiếu ?warehouse → về danh sách, không gọi API kho', async () => {
    const { getWarehouse } = renderPage(draftForm, SUPERVISOR, '/export-forms/xf-1')
    expect(await screen.findByText('DANH SÁCH')).toBeInTheDocument()
    await waitFor(() => expect(getWarehouse).not.toHaveBeenCalled())
  })
})
