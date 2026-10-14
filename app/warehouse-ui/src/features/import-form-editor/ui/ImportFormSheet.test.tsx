import { screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { HttpResponse, http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { AvailableMaterial, ImportForm } from '@/entities/import-form'
import { apiError, ok, paginated } from '@/shared/test/api'
import { confirmDialog } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { ImportFormSheet } from './ImportFormSheet'

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

type SetupOptions = {
  formSlug?: string
  open?: boolean
  detail?: ImportForm | 'error'
}

function setup({ formSlug, open = true, detail }: SetupOptions = {}) {
  server.use(mswHttp.get(`${URL_W}/available-materials`, () => paginated([flour])))
  if (formSlug && detail) {
    server.use(
      mswHttp.get(`${URL_W}/${formSlug}`, () =>
        detail === 'error' ? apiError(500, 100500, 'Internal error') : ok(detail),
      ),
    )
  }
  const onOpenChange = vi.fn()
  const onSaved = vi.fn()
  const ui = (isOpen: boolean) => (
    <ImportFormSheet
      open={isOpen}
      onOpenChange={onOpenChange}
      warehouseSlug="w-a"
      warehouseName="Kho A"
      formSlug={formSlug}
      onSaved={onSaved}
    />
  )
  const r = renderWithProviders(ui(open), { auth: 'admin' })
  return { ...r, onOpenChange, onSaved, reopen: (o: boolean) => r.rerender(ui(o)) }
}

const noteBox = () => screen.findByRole('textbox', { name: /^Ghi chú$/ })
const saveButton = () => screen.getByRole('button', { name: 'Lưu nháp' })

async function fillCreate(user: ReturnType<typeof setup>['user']) {
  await user.type(screen.getByRole('textbox', { name: /^Số hoá đơn/ }), 'HD-9')
  await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' }))
  await user.click(await screen.findByText('VT-01 · Bột mì'))
  await user.type(screen.getByRole('textbox', { name: 'Số lượng dòng 1' }), '5')
  await user.type(screen.getByRole('textbox', { name: 'Đơn giá dòng 1' }), '1000')
}

describe('ImportFormSheet', () => {
  it('tạo: mở sheet rộng, tiêu đề có tên kho, chân sheet hiện Tổng', async () => {
    setup()
    const dialog = await screen.findByRole('dialog', { name: 'Tạo phiếu nhập · Kho A' })
    expect(dialog.className).toContain('data-[side=right]:sm:max-w-5xl')
    expect(within(dialog).getByText(/^Tổng:/)).toBeInTheDocument()
  })

  it('đóng thì không render và không gọi available-materials', async () => {
    let calls = 0
    server.use(
      mswHttp.get(`${URL_W}/available-materials`, () => {
        calls += 1
        return paginated([flour])
      }),
    )
    renderWithProviders(
      <ImportFormSheet
        open={false}
        onOpenChange={vi.fn()}
        warehouseSlug="w-a"
        warehouseName="Kho A"
      />,
      { auth: 'admin' },
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 50))
    expect(calls).toBe(0)
  })

  it('tạo: điền đủ → hộp xác nhận → POST đúng body → đóng sheet + onSaved', async () => {
    let body: unknown
    server.use(
      mswHttp.post(URL_W, async ({ request }) => {
        body = await request.json()
        return ok(draftForm)
      }),
    )
    const { user, onSaved, onOpenChange } = setup()
    await fillCreate(user)
    await user.click(saveButton())
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('HD-9')
    await confirmDialog(user, 'Tạo phiếu')
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(draftForm))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(body).toMatchObject({
      invoiceCode: 'HD-9',
      items: [{ materialSlug: 'm-flour', unitSlug: 'u-kg', quantity: 5, unitPrice: 1000 }],
    })
    expect((body as { code: string }).code).toMatch(/^PN-\d{8}-\d{4}$/)
  })

  it('tạo: thiếu số HĐ → lỗi tại ô, không mở hộp xác nhận', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Lưu nháp' }))
    expect(await screen.findByText('Nhập số hoá đơn')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('tạo: 101304 (trùng mã) → lỗi tại ô Mã phiếu, sheet vẫn mở', async () => {
    server.use(mswHttp.post(URL_W, () => apiError(400, 101304, 'Import form code does exist')))
    const { user, onOpenChange } = setup()
    await fillCreate(user)
    await user.click(saveButton())
    await confirmDialog(user, 'Tạo phiếu')
    expect(await screen.findByText('Mã phiếu đã tồn tại')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('tạo: mở lại sheet thì form về trạng thái trống', async () => {
    const { user, reopen } = setup()
    const invoice = await screen.findByRole('textbox', { name: /^Số hoá đơn/ })
    await user.type(invoice, 'HD-9')
    reopen(false)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    reopen(true)
    expect(await screen.findByRole('textbox', { name: /^Số hoá đơn/ })).toHaveValue('')
  })

  it('đóng sheet khi đang mở hộp xác nhận tạo → hộp cũng đóng', async () => {
    const { user, reopen } = setup()
    await fillCreate(user)
    await user.click(saveButton())
    await screen.findByRole('alertdialog')
    reopen(false)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    reopen(true)
    await screen.findByRole('dialog')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('sửa: tự tải chi tiết, hiện skeleton rồi điền sẵn; Lưu khoá khi chưa đổi', async () => {
    setup({ formSlug: 'if-1', detail: draftForm })
    expect(
      await screen.findByRole('dialog', { name: 'Sửa phiếu nhập PN-0001' }),
    ).toBeInTheDocument()
    expect(await screen.findByRole('textbox', { name: /^Số hoá đơn/ })).toHaveValue('HD-123')
    expect(saveButton()).toBeDisabled()
  })

  it('sửa: đổi → PATCH kèm version + items, đóng sheet + onSaved', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${URL_W}/if-1`, async ({ request }) => {
        body = await request.json()
        return ok({ ...draftForm, version: 4 })
      }),
    )
    const { user, onSaved, onOpenChange } = setup({ formSlug: 'if-1', detail: draftForm })
    await user.clear(await noteBox())
    await user.click(saveButton())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(body).toMatchObject({
      version: 3,
      note: '',
      items: [{ materialSlug: 'm-flour', unitSlug: 'u-bag', quantity: 10, unitPrice: 375000 }],
    })
  })

  it('sửa: tải chi tiết lỗi → alert kèm Thử lại, bấm thì tải lại và hiện form', async () => {
    let calls = 0
    server.use(mswHttp.get(`${URL_W}/available-materials`, () => paginated([flour])))
    server.use(
      mswHttp.get(`${URL_W}/if-1`, () => {
        calls += 1
        return calls === 1 ? apiError(500, 100500, 'Internal error') : ok(draftForm)
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <ImportFormSheet
        open
        onOpenChange={onOpenChange}
        warehouseSlug="w-a"
        warehouseName="Kho A"
        formSlug="if-1"
      />,
      { auth: 'admin' },
    )
    const alert = await screen.findByRole('alert')
    expect(screen.queryByRole('textbox', { name: /^Số hoá đơn/ })).not.toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByRole('textbox', { name: /^Số hoá đơn/ })).toHaveValue('HD-123')
    expect(calls).toBe(2)
  })

  it('sửa: phiếu không còn là Nháp → hiện câu không sửa được, không render form', async () => {
    setup({ formSlug: 'if-1', detail: { ...draftForm, status: 'CONFIRMED' } })
    expect(await screen.findByText(/không còn ở trạng thái Nháp/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /^Số hoá đơn/ })).not.toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('available-materials lỗi → hiện alert kèm Thử lại; bấm Thử lại thì nạp lại', async () => {
    let calls = 0
    server.use(
      mswHttp.get(`${URL_W}/available-materials`, () => {
        calls += 1
        return calls === 1 ? apiError(500, 100500, 'Internal error') : paginated([flour])
      }),
    )
    const { user } = renderWithProviders(
      <ImportFormSheet open onOpenChange={vi.fn()} warehouseSlug="w-a" warehouseName="Kho A" />,
      { auth: 'admin' },
    )
    const alert = await screen.findByRole('alert')
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(calls).toBe(2))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' }))
    expect(await screen.findByText('VT-01 · Bột mì')).toBeInTheDocument()
  })

  it('sửa: vật tư của dòng không còn trong danh sách → ô đơn vị vẫn hiện đơn vị đã lưu', async () => {
    server.use(mswHttp.get(`${URL_W}/available-materials`, () => paginated([])))
    server.use(mswHttp.get(`${URL_W}/if-1`, () => ok(draftForm)))
    renderWithProviders(
      <ImportFormSheet
        open
        onOpenChange={vi.fn()}
        warehouseSlug="w-a"
        warehouseName="Kho A"
        formSlug="if-1"
      />,
      { auth: 'admin' },
    )
    const unit = await screen.findByRole('combobox', { name: 'Đơn vị dòng 1' })
    await waitFor(() => expect(unit).toHaveTextContent('BAG · Bao 25kg'))
  })

  it('sửa: 409 → đóng sheet + toast conflict, không lỗi tại ô, không hỏi huỷ', async () => {
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id')
    server.use(mswHttp.patch(`${URL_W}/if-1`, () => apiError(409, 100800, 'conflict')))
    const { user, onOpenChange, onSaved } = setup({ formSlug: 'if-1', detail: draftForm })
    await user.clear(await noteBox())
    await user.click(saveButton())
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(errorSpy).toHaveBeenCalledWith(
      'Phiếu vừa bị người khác thay đổi — đã tải lại bản mới nhất.',
    )
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(document.querySelector('[data-slot="form-message"]')).toBeNull()
    errorSpy.mockRestore()
  })

  it('sửa: 101314 (không còn là nháp) → như 409', async () => {
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id')
    server.use(mswHttp.patch(`${URL_W}/if-1`, () => apiError(409, 101314, 'not draft')))
    const { user, onOpenChange } = setup({ formSlug: 'if-1', detail: draftForm })
    await user.clear(await noteBox())
    await user.click(saveButton())
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(errorSpy).toHaveBeenCalledTimes(1)
    errorSpy.mockRestore()
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
    const { user } = setup({ formSlug: 'if-1', detail: draftForm })
    await user.clear(await noteBox())
    const save = saveButton()
    expect(save).toBeEnabled()
    await user.upload(screen.getByLabelText('Chứng từ đính kèm'), new File(['x'], 'a.pdf'))
    await waitFor(() => expect(save).toBeDisabled())
    release()
    await waitFor(() => expect(save).toBeEnabled())
  })

  it('đã sửa mà bấm Huỷ → hỏi "Bỏ thay đổi chưa lưu?"; Tiếp tục sửa thì ở lại', async () => {
    const { user, onOpenChange } = setup({ formSlug: 'if-1', detail: draftForm })
    await user.clear(await noteBox())
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Bỏ thay đổi chưa lưu?')
    await user.click(within(dialog).getByRole('button', { name: 'Tiếp tục sửa' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('đã sửa → Bỏ thay đổi thì đóng sheet', async () => {
    const { user, onOpenChange } = setup({ formSlug: 'if-1', detail: draftForm })
    await user.clear(await noteBox())
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))
    await confirmDialog(user, 'Bỏ thay đổi')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('đóng tab: chỉ cảnh báo khi sheet mở và form đã sửa', async () => {
    const { user, reopen } = setup({ formSlug: 'if-1', detail: draftForm })
    const fire = () => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    await noteBox()
    expect(fire()).toBe(false)
    await user.type(await noteBox(), 'x')
    expect(fire()).toBe(true)
    reopen(false)
    await waitFor(() => expect(fire()).toBe(false))
  })
})
