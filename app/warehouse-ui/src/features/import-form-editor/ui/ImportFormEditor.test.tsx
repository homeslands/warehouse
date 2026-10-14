import { screen, waitFor, within } from '@testing-library/react'
import { HttpResponse, http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { AvailableMaterial, ImportForm } from '@/entities/import-form'
import { apiError, ok, paginated } from '@/shared/test/api'
import { confirmDialog } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithRouter } from '@/shared/test/render'
import { ImportFormEditor } from './ImportFormEditor'

const BASE = 'http://localhost:8085/api/v1'
const URL_W = `${BASE}/warehouses/w-a/import-forms`

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

function setup(form?: ImportForm) {
  server.use(mswHttp.get(`${URL_W}/available-materials`, () => paginated([flour])))
  const onSaved = vi.fn()
  const onConflict = vi.fn()
  const r = renderWithRouter(
    [
      {
        path: '/editor',
        element: (
          <ImportFormEditor
            warehouseSlug="w-a"
            form={form}
            onSaved={onSaved}
            onCancel={vi.fn()}
            onConflict={onConflict}
          />
        ),
      },
      { path: '/elsewhere', element: <p>NƠI KHÁC</p> },
    ],
    { route: '/editor', auth: 'admin' },
  )
  return { ...r, onSaved, onConflict }
}

describe('ImportFormEditor', () => {
  it('tạo: điền đủ → hộp xác nhận → POST đúng body → onSaved', async () => {
    let body: unknown
    server.use(
      mswHttp.post(URL_W, async ({ request }) => {
        body = await request.json()
        return ok(draftForm)
      }),
    )
    const { user, onSaved } = setup()
    await user.type(screen.getByRole('textbox', { name: /^Số hoá đơn/ }), 'HD-9')
    await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' }))
    await user.click(await screen.findByText('VT-01 · Bột mì'))
    await user.type(screen.getByRole('textbox', { name: 'Số lượng dòng 1' }), '5')
    await user.type(screen.getByRole('textbox', { name: 'Đơn giá dòng 1' }), '1000')
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await confirmDialog(user, 'Tạo phiếu')
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(draftForm))
    expect(body).toMatchObject({
      invoiceCode: 'HD-9',
      items: [{ materialSlug: 'm-flour', unitSlug: 'u-kg', quantity: 5, unitPrice: 1000 }],
    })
    expect((body as { code: string }).code).toMatch(/^PN-\d{8}-\d{4}$/)
  })

  it('tạo: thiếu số HĐ → lỗi tại ô, không mở hộp xác nhận', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    expect(await screen.findByText('Nhập số hoá đơn')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('tạo: 101304 (trùng mã) → lỗi tại ô Mã phiếu', async () => {
    server.use(mswHttp.post(URL_W, () => apiError(400, 101304, 'Import form code does exist')))
    const { user } = setup()
    await user.type(screen.getByRole('textbox', { name: /^Số hoá đơn/ }), 'HD-9')
    await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' }))
    await user.click(await screen.findByText('VT-01 · Bột mì'))
    await user.type(screen.getByRole('textbox', { name: 'Số lượng dòng 1' }), '5')
    await user.type(screen.getByRole('textbox', { name: 'Đơn giá dòng 1' }), '1000')
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await confirmDialog(user, 'Tạo phiếu')
    expect(await screen.findByText('Mã phiếu đã tồn tại')).toBeInTheDocument()
  })

  it('sửa: Lưu khoá khi chưa đổi; đổi → PATCH kèm version + items', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${URL_W}/if-1`, async ({ request }) => {
        body = await request.json()
        return ok({ ...draftForm, version: 4 })
      }),
    )
    const { user, onSaved } = setup(draftForm)
    const save = await screen.findByRole('button', { name: 'Lưu nháp' })
    expect(save).toBeDisabled()
    await user.clear(screen.getByRole('textbox', { name: /^Ghi chú$/ }))
    await user.click(save)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(body).toMatchObject({
      version: 3,
      note: '',
      items: [{ materialSlug: 'm-flour', unitSlug: 'u-bag', quantity: 10, unitPrice: 375000 }],
    })
  })

  it('available-materials lỗi → hiện alert kèm Thử lại; bấm Thử lại thì nạp lại', async () => {
    let calls = 0
    server.use(
      mswHttp.get(`${URL_W}/available-materials`, () => {
        calls += 1
        return calls === 1 ? apiError(500, 100500, 'Internal error') : paginated([flour])
      }),
    )
    const { user } = renderWithRouter(
      [
        {
          path: '/editor',
          element: (
            <ImportFormEditor
              warehouseSlug="w-a"
              onSaved={vi.fn()}
              onCancel={vi.fn()}
              onConflict={vi.fn()}
            />
          ),
        },
      ],
      { route: '/editor', auth: 'admin' },
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(calls).toBe(2))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' }))
    expect(await screen.findByText('VT-01 · Bột mì')).toBeInTheDocument()
  })

  it('sửa: vật tư của dòng không còn trong danh sách → ô đơn vị vẫn hiện đơn vị đã lưu', async () => {
    server.use(mswHttp.get(`${URL_W}/available-materials`, () => paginated([])))
    const r = renderWithRouter(
      [
        {
          path: '/editor',
          element: (
            <ImportFormEditor
              warehouseSlug="w-a"
              form={draftForm}
              onSaved={vi.fn()}
              onCancel={vi.fn()}
              onConflict={vi.fn()}
            />
          ),
        },
      ],
      { route: '/editor', auth: 'admin' },
    )
    expect(r).toBeTruthy()
    const unit = await screen.findByRole('combobox', { name: 'Đơn vị dòng 1' })
    await waitFor(() => expect(unit).toHaveTextContent('BAG · Bao 25kg'))
  })

  it('sửa: 409 → onConflict (điều hướng đi không bị hỏi), không hiện lỗi tại ô', async () => {
    server.use(mswHttp.patch(`${URL_W}/if-1`, () => apiError(409, 100800, 'conflict')))
    const { user, router, onConflict } = setup(draftForm)
    onConflict.mockImplementation(() => void router.navigate('/elsewhere'))
    await user.clear(screen.getByRole('textbox', { name: /^Ghi chú$/ }))
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    expect(await screen.findByText('NƠI KHÁC')).toBeInTheDocument()
    expect(onConflict).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(document.querySelector('[data-slot="form-message"]')).toBeNull()
  })

  it('sửa: 101314 (không còn là nháp) → onConflict', async () => {
    server.use(mswHttp.patch(`${URL_W}/if-1`, () => apiError(409, 101314, 'not draft')))
    const { user, onConflict } = setup(draftForm)
    await user.clear(screen.getByRole('textbox', { name: /^Ghi chú$/ }))
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await waitFor(() => expect(onConflict).toHaveBeenCalledTimes(1))
  })

  it('đang upload file → Lưu nháp bị khoá, xong thì mở lại', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    server.use(
      mswHttp.post(`${BASE}/file/upload`, async () => {
        await gate
        return HttpResponse.json(
          {
            message: 'File a-1760000000000.pdf uploaded to S3 successfully',
            statusCode: 201,
            timestamp: '',
          },
          { status: 201 },
        )
      }),
    )
    const { user } = setup(draftForm)
    await user.clear(screen.getByRole('textbox', { name: /^Ghi chú$/ }))
    const save = screen.getByRole('button', { name: 'Lưu nháp' })
    expect(save).toBeEnabled()
    await user.upload(screen.getByLabelText('Chứng từ đính kèm'), new File(['x'], 'a.pdf'))
    await waitFor(() => expect(save).toBeDisabled())
    release()
    await waitFor(() => expect(save).toBeEnabled())
  })

  it('đã sửa mà rời trang → hỏi "Bỏ thay đổi chưa lưu?"; Tiếp tục sửa thì ở lại', async () => {
    const { user, router } = setup(draftForm)
    await user.clear(await screen.findByRole('textbox', { name: /^Ghi chú$/ }))
    void router.navigate('/elsewhere')
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Bỏ thay đổi chưa lưu?')
    await user.click(within(dialog).getByRole('button', { name: 'Tiếp tục sửa' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/editor')
  })

  it('đã sửa mà rời trang → Bỏ thay đổi thì đi', async () => {
    const { user, router } = setup(draftForm)
    await user.clear(await screen.findByRole('textbox', { name: /^Ghi chú$/ }))
    void router.navigate('/elsewhere')
    await confirmDialog(user, 'Bỏ thay đổi')
    expect(await screen.findByText('NƠI KHÁC')).toBeInTheDocument()
  })

  it('lưu thành công rồi điều hướng → KHÔNG hỏi', async () => {
    server.use(mswHttp.patch(`${URL_W}/if-1`, () => ok({ ...draftForm, version: 4 })))
    const { user, router, onSaved } = setup(draftForm)
    onSaved.mockImplementation(() => void router.navigate('/elsewhere'))
    await user.clear(await screen.findByRole('textbox', { name: /^Ghi chú$/ }))
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    expect(await screen.findByText('NƠI KHÁC')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
