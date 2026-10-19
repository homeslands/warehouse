import { screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { HttpResponse, http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentType } from 'react'
import type { AvailableMaterial, ImportForm } from '@/entities/import-form'
import type { AddMaterialDialogProps } from '@/entities/inventory'
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
  suppliers: [{ slug: 's-1', code: 'NCC-01', name: 'NCC Bột' }],
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
  canPickSupplier?: boolean
  canConfirm?: boolean
  AddMaterialDialog?: ComponentType<AddMaterialDialogProps>
}

function setup({
  formSlug,
  open = true,
  detail,
  canPickSupplier,
  canConfirm,
  AddMaterialDialog,
}: SetupOptions = {}) {
  server.use(
    mswHttp.get(`${BASE}/suppliers`, () =>
      paginated([
        { slug: 's-1', code: 'NCC-01', name: 'NCC Bột' },
        { slug: 's-2', code: 'NCC-02', name: 'NCC Đường' },
      ]),
    ),
  )
  server.use(
    mswHttp.get(`${URL_W}/available-materials`, () =>
      paginated([flour, { ...flour, slug: 'm-sugar', code: 'VT-02', name: 'Đường' }]),
    ),
  )
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
      canPickSupplier={canPickSupplier}
      canConfirm={canConfirm}
      AddMaterialDialog={AddMaterialDialog}
      materialAbilities={
        AddMaterialDialog
          ? { search: true, assign: true, create: true, attachSupplier: true }
          : undefined
      }
    />
  )
  const r = renderWithProviders(ui(open), { auth: 'admin' })
  return { ...r, onOpenChange, onSaved, reopen: (o: boolean) => r.rerender(ui(o)) }
}

const noteBox = () => screen.findByRole('textbox', { name: /^Ghi chú$/ })
const saveButton = () => screen.getByRole('button', { name: 'Lưu' })
const reviewButton = () => screen.getByRole('button', { name: 'Kiểm tra & lưu' })

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

  it('tạo: điền đủ → hộp Kiểm tra → Lưu nháp → POST đúng body → đóng sheet + onSaved', async () => {
    let body: unknown
    server.use(
      mswHttp.post(URL_W, async ({ request }) => {
        body = await request.json()
        return ok(draftForm)
      }),
    )
    const { user, onSaved, onOpenChange } = setup()
    await fillCreate(user)
    await user.click(reviewButton())
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('HD-9')
    await confirmDialog(user, 'Lưu nháp')
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ form: draftForm, confirmed: false }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(body).toMatchObject({
      invoiceCode: 'HD-9',
      items: [{ materialSlug: 'm-flour', unitSlug: 'u-kg', quantity: 5, unitPrice: 1000 }],
    })
    expect((body as { code: string }).code).toMatch(/^PN-\d{8}-\d{4}$/)
  })

  it('tạo: thiếu số HĐ → lỗi tại ô, không mở hộp xác nhận', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Kiểm tra & lưu' }))
    expect(await screen.findByText('Nhập số hoá đơn')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('tạo: 101304 (trùng mã) → lỗi tại ô Mã phiếu, sheet vẫn mở', async () => {
    server.use(mswHttp.post(URL_W, () => apiError(400, 101304, 'Import form code does exist')))
    const { user, onOpenChange } = setup()
    await fillCreate(user)
    await user.click(reviewButton())
    await confirmDialog(user, 'Lưu nháp')
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
    await user.click(reviewButton())
    await screen.findByRole('alertdialog')
    reopen(false)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    reopen(true)
    await screen.findByRole('dialog')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('sửa: chi tiết đang tải → không hiện Tổng; tiêu đề dùng formCode; tải xong có Tổng', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    server.use(
      mswHttp.get(`${URL_W}/available-materials`, () => paginated([flour])),
      mswHttp.get(`${URL_W}/if-1`, async () => {
        await gate
        return ok(draftForm)
      }),
    )
    renderWithProviders(
      <ImportFormSheet
        open
        onOpenChange={vi.fn()}
        warehouseSlug="w-a"
        warehouseName="Kho A"
        formSlug="if-1"
        formCode="PN-0001"
      />,
      { auth: 'admin' },
    )
    const dialog = await screen.findByRole('dialog', { name: 'Sửa phiếu nhập PN-0001' })
    expect(within(dialog).queryByText(/^Tổng:/)).not.toBeInTheDocument()
    release()
    expect(await within(dialog).findByText(/^Tổng:/)).toBeInTheDocument()
  })

  it('sửa: tải lỗi hoặc không phải Nháp → không hiện Tổng', async () => {
    setup({ formSlug: 'if-1', detail: { ...draftForm, status: 'CONFIRMED' } })
    await screen.findByText(/không còn ở trạng thái Nháp/)
    expect(screen.queryByText(/^Tổng:/)).not.toBeInTheDocument()
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
    await waitFor(() => expect(unit).toHaveTextContent('BAG'))
    expect(unit).toHaveAttribute('title', 'BAG · Bao 25kg')
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

  it('đang upload file → Lưu bị khoá, xong thì mở lại', async () => {
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

describe('ImportFormSheet - đầu phiếu bên bán', () => {
  it('có quyền chọn NCC: có ô Bên bán bắt buộc, trống thì báo lỗi tại ô', async () => {
    const { user } = setup({ canPickSupplier: true })
    expect(await screen.findByRole('combobox', { name: /Bên bán/ })).toBeInTheDocument()
    await user.click(reviewButton())
    // Placeholder của ô và thông báo lỗi dùng chung chữ "Chọn bên bán".
    await waitFor(() => expect(screen.getAllByText('Chọn bên bán')).toHaveLength(2))
    expect(screen.getByRole('combobox', { name: /Bên bán/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('không có quyền chọn NCC: không có ô Bên bán, lưu không bị chặn vì bên bán', async () => {
    const { user } = setup()
    await screen.findByRole('textbox', { name: /^Số hoá đơn/ })
    expect(screen.queryByRole('combobox', { name: /Bên bán/ })).not.toBeInTheDocument()
    await fillCreate(user)
    await user.click(reviewButton())
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
  })

  it('đổi bên bán khi 2 dòng đã chọn vật tư → báo số dòng; sửa ô khác thì mất', async () => {
    const { user } = setup({ canPickSupplier: true })
    const seller = await screen.findByRole('combobox', { name: /Bên bán/ })
    await user.click(seller)
    await user.click(await screen.findByText('NCC-01 · NCC Bột'))
    await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' }))
    await user.click(await screen.findByText('VT-01 · Bột mì'))
    await user.click(screen.getByRole('button', { name: 'Thêm dòng' }))
    await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 2' }))
    await user.click(await screen.findByText('VT-02 · Đường'))
    await user.click(screen.getByRole('combobox', { name: /Bên bán/ }))
    await user.click(await screen.findByText('NCC-02 · NCC Đường'))
    expect(await screen.findByText('Đã đổi bên bán cho 2 dòng')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: /^Số hoá đơn/ }), 'H')
    expect(screen.queryByText('Đã đổi bên bán cho 2 dòng')).not.toBeInTheDocument()
  })

  it('dải 3 bước có đúng 3 nút', async () => {
    setup()
    const nav = await screen.findByRole('navigation', { name: 'Các bước lập phiếu' })
    const buttons = within(nav).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      '① Thông tin phiếu',
      '② Chi tiết vật tư',
      '③ Kiểm tra & lưu',
    ])
  })
  it('dải bước đánh ✓ khi ① và ② đủ thông tin, ② kèm số dòng', async () => {
    const { user } = setup()
    const nav = await screen.findByRole('navigation', { name: 'Các bước lập phiếu' })
    expect(within(nav).getByRole('button', { name: '① Thông tin phiếu' })).toBeInTheDocument()
    await fillCreate(user)
    expect(
      await within(nav).findByRole('button', { name: 'Đã xong: Thông tin phiếu' }),
    ).toBeInTheDocument()
    expect(
      within(nav).getByRole('button', { name: 'Đã xong: Chi tiết vật tư · 1 dòng' }),
    ).toBeInTheDocument()
  })

  it('tạo: bấm "③ Kiểm tra & lưu" vẫn kiểm form rồi mở hộp Kiểm tra', async () => {
    const { user } = setup()
    await fillCreate(user)
    await user.click(screen.getByRole('button', { name: '③ Kiểm tra & lưu' }))
    expect(await screen.findByRole('alertdialog', { name: 'Kiểm tra phiếu nhập' })).toBeVisible()
  })

  it('sửa: bấm "③ Kiểm tra & lưu" không gửi form — sheet vẫn mở, focus về nút "Lưu"', async () => {
    let patches = 0
    server.use(
      mswHttp.patch(`${URL_W}/if-1`, () => {
        patches += 1
        return ok({ ...draftForm, version: 4 })
      }),
    )
    const { user, onOpenChange, onSaved } = setup({ formSlug: 'if-1', detail: draftForm })
    await user.clear(await noteBox())
    await user.click(screen.getByRole('button', { name: '③ Kiểm tra & lưu' }))
    await waitFor(() => expect(saveButton()).toHaveFocus())
    await new Promise((r) => setTimeout(r, 50))
    expect(patches).toBe(0)
    expect(onSaved).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByRole('dialog', { name: 'Sửa phiếu nhập PN-0001' })).toBeInTheDocument()
  })
})

describe('ImportFormSheet - kiểm tra, lưu nháp, lưu & xác nhận', () => {
  const confirmedForm: ImportForm = { ...draftForm, status: 'CONFIRMED', version: 4 }

  it('tạo: nút gửi chính là "Kiểm tra & lưu"; Lưu nháp không bật toast của hook', async () => {
    const successSpy = vi.spyOn(toast, 'success').mockImplementation(() => 'id')
    server.use(mswHttp.post(URL_W, () => ok(draftForm)))
    const { user, onSaved, onOpenChange } = setup()
    await fillCreate(user)
    await user.click(reviewButton())
    expect(await screen.findByRole('alertdialog', { name: 'Kiểm tra phiếu nhập' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Lưu & xác nhận' })).not.toBeInTheDocument()
    await confirmDialog(user, 'Lưu nháp')
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ form: draftForm, confirmed: false }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(successSpy).not.toHaveBeenCalled()
    successSpy.mockRestore()
  })

  it('tạo: đang gửi POST → hộp Kiểm tra vẫn mở, các nút bị khoá', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    server.use(
      mswHttp.post(URL_W, async () => {
        await gate
        return ok(draftForm)
      }),
    )
    const { user, onSaved } = setup({ canConfirm: true })
    await fillCreate(user)
    await user.click(reviewButton())
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu nháp' }))
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Lưu & xác nhận' })).toBeDisabled(),
    )
    expect(within(dialog).getByRole('button', { name: 'Quay lại sửa' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Lưu nháp' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    release()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('tạo: "Quay lại sửa" đóng hộp, giữ nguyên form, không gọi API', async () => {
    let posts = 0
    server.use(
      mswHttp.post(URL_W, () => {
        posts += 1
        return ok(draftForm)
      }),
    )
    const { user } = setup()
    await fillCreate(user)
    await user.click(reviewButton())
    await confirmDialog(user, 'Quay lại sửa')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: /^Số hoá đơn/ })).toHaveValue('HD-9')
    expect(posts).toBe(0)
  })

  it('tạo: đơn giá 0 → cảnh báo mềm không chặn; "sửa" đóng hộp và focus ô đơn giá của dòng', async () => {
    const { user } = setup()
    await fillCreate(user)
    const price = screen.getByRole('textbox', { name: 'Đơn giá dòng 1' })
    await user.clear(price)
    await user.type(price, '0')
    await user.click(reviewButton())
    expect(await screen.findByText('Cần xem lại (1)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'sửa' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(price).toHaveFocus())
  })

  it('tạo: vật tư vừa thêm từ hộp (ngoài danh sách) → cảnh báo đơn giá 0 vẫn có tên của dòng', async () => {
    function FakeAddDialog({ open, onAdded, onOpenChange }: AddMaterialDialogProps) {
      if (!open) return null
      return (
        <div role="dialog" aria-label="Thêm vật tư giả">
          <button
            type="button"
            onClick={() => {
              onAdded({
                slug: 'm-cement',
                label: 'VT-09 · Xi măng',
                baseUnit: { slug: 'u-kg', label: 'KG · Kilogram' },
              })
              onOpenChange(false)
            }}
          >
            Gắn giả
          </button>
        </div>
      )
    }
    const { user } = setup({ AddMaterialDialog: FakeAddDialog })
    await user.type(await screen.findByRole('textbox', { name: /^Số hoá đơn/ }), 'HD-9')
    await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' }))
    await user.click(await screen.findByRole('button', { name: /Thêm vật tư vào kho/ }))
    await user.click(await screen.findByRole('button', { name: 'Gắn giả' }))
    await user.type(screen.getByRole('textbox', { name: 'Số lượng dòng 1' }), '5')
    await user.type(screen.getByRole('textbox', { name: 'Đơn giá dòng 1' }), '0')
    await user.click(reviewButton())
    const dialog = await screen.findByRole('alertdialog', { name: 'Kiểm tra phiếu nhập' })
    expect(within(dialog).getByText('Dòng 1 · VT-09 · Xi măng — đơn giá 0')).toBeInTheDocument()
  })

  it('tạo: có quyền xác nhận → "Lưu & xác nhận" tạo rồi xác nhận với version phiếu vừa tạo', async () => {
    const successSpy = vi.spyOn(toast, 'success').mockImplementation(() => 'id')
    let confirmBody: unknown
    server.use(
      mswHttp.post(URL_W, () => ok(draftForm)),
      mswHttp.post(`${URL_W}/if-1/confirm`, async ({ request }) => {
        confirmBody = await request.json()
        return ok(confirmedForm)
      }),
    )
    const { user, onSaved, onOpenChange } = setup({ canConfirm: true })
    await fillCreate(user)
    await user.click(reviewButton())
    await confirmDialog(user, 'Lưu & xác nhận')
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({ form: confirmedForm, confirmed: true }),
    )
    expect(confirmBody).toEqual({ version: 3 })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(successSpy).not.toHaveBeenCalled()
    successSpy.mockRestore()
  })

  it('tạo: xác nhận trả 500 → phiếu nháp vẫn được lưu, onSaved kèm confirmError, sheet đóng', async () => {
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id')
    server.use(
      mswHttp.post(URL_W, () => ok(draftForm)),
      mswHttp.post(`${URL_W}/if-1/confirm`, () => apiError(500, 100500, 'Internal error')),
    )
    const { user, onSaved, onOpenChange } = setup({ canConfirm: true })
    await fillCreate(user)
    await user.click(reviewButton())
    await confirmDialog(user, 'Lưu & xác nhận')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onSaved.mock.calls[0][0]).toMatchObject({ form: draftForm, confirmed: false })
    expect(onSaved.mock.calls[0][0].confirmError).toBeDefined()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('tạo: tạo lỗi khi Lưu & xác nhận → không xác nhận, lỗi tại ô, sheet vẫn mở', async () => {
    let confirms = 0
    server.use(
      mswHttp.post(URL_W, () => apiError(400, 101304, 'Import form code does exist')),
      mswHttp.post(`${URL_W}/if-1/confirm`, () => {
        confirms += 1
        return ok(confirmedForm)
      }),
    )
    const { user, onSaved } = setup({ canConfirm: true })
    await fillCreate(user)
    await user.click(reviewButton())
    await confirmDialog(user, 'Lưu & xác nhận')
    expect(await screen.findByText('Mã phiếu đã tồn tại')).toBeInTheDocument()
    expect(confirms).toBe(0)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('sửa: không có quyền xác nhận → không có "Lưu & xác nhận"', async () => {
    setup({ formSlug: 'if-1', detail: draftForm })
    await screen.findByRole('textbox', { name: /^Số hoá đơn/ })
    expect(screen.queryByRole('button', { name: 'Lưu & xác nhận' })).not.toBeInTheDocument()
  })

  it('sửa: chưa đổi gì + "Lưu & xác nhận" → không PATCH, chỉ xác nhận với version cũ', async () => {
    let patches = 0
    let confirmBody: unknown
    server.use(
      mswHttp.patch(`${URL_W}/if-1`, () => {
        patches += 1
        return ok(draftForm)
      }),
      mswHttp.post(`${URL_W}/if-1/confirm`, async ({ request }) => {
        confirmBody = await request.json()
        return ok(confirmedForm)
      }),
    )
    const { user, onSaved, onOpenChange } = setup({
      formSlug: 'if-1',
      detail: draftForm,
      canConfirm: true,
    })
    await screen.findByRole('textbox', { name: /^Số hoá đơn/ })
    expect(saveButton()).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({ form: confirmedForm, confirmed: true }),
    )
    expect(patches).toBe(0)
    expect(confirmBody).toEqual({ version: 3 })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('sửa: chưa đổi gì + xác nhận trả 409 → như phiếu cũ: đóng sheet + toast conflict, không onSaved', async () => {
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id')
    server.use(mswHttp.post(`${URL_W}/if-1/confirm`, () => apiError(409, 100800, 'conflict')))
    const { user, onSaved, onOpenChange } = setup({
      formSlug: 'if-1',
      detail: draftForm,
      canConfirm: true,
    })
    await screen.findByRole('textbox', { name: /^Số hoá đơn/ })
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(errorSpy).toHaveBeenCalledWith(
      'Phiếu vừa bị người khác thay đổi — đã tải lại bản mới nhất.',
    )
    expect(onSaved).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('sửa: chưa đổi gì + xác nhận lỗi khác → toast lỗi, sheet vẫn mở, không báo "Đã lưu"', async () => {
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id')
    server.use(mswHttp.post(`${URL_W}/if-1/confirm`, () => apiError(500, 100500, 'Internal error')))
    const { user, onSaved, onOpenChange } = setup({
      formSlug: 'if-1',
      detail: draftForm,
      canConfirm: true,
    })
    await screen.findByRole('textbox', { name: /^Số hoá đơn/ })
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    expect(onSaved).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Lưu & xác nhận' })).toBeEnabled(),
    )
    errorSpy.mockRestore()
  })

  it('sửa: đã đổi + "Lưu & xác nhận" → PATCH rồi xác nhận với version mới', async () => {
    const order: string[] = []
    let confirmBody: unknown
    server.use(
      mswHttp.patch(`${URL_W}/if-1`, () => {
        order.push('patch')
        return ok({ ...draftForm, version: 4, note: '' })
      }),
      mswHttp.post(`${URL_W}/if-1/confirm`, async ({ request }) => {
        order.push('confirm')
        confirmBody = await request.json()
        return ok({ ...confirmedForm, version: 5 })
      }),
    )
    const { user, onSaved } = setup({ formSlug: 'if-1', detail: draftForm, canConfirm: true })
    await user.clear(await noteBox())
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(order).toEqual(['patch', 'confirm'])
    expect(confirmBody).toEqual({ version: 4 })
    expect(onSaved.mock.calls[0][0]).toMatchObject({ confirmed: true })
  })

  it('sửa: PATCH xong mà xác nhận lỗi → onSaved(confirmed:false, confirmError) với phiếu đã lưu, sheet đóng', async () => {
    const saved = { ...draftForm, version: 4, note: '' }
    server.use(
      mswHttp.patch(`${URL_W}/if-1`, () => ok(saved)),
      mswHttp.post(`${URL_W}/if-1/confirm`, () => apiError(500, 100500, 'Internal error')),
    )
    const { user, onSaved, onOpenChange } = setup({
      formSlug: 'if-1',
      detail: draftForm,
      canConfirm: true,
    })
    await user.clear(await noteBox())
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onSaved.mock.calls[0][0]).toMatchObject({ form: saved, confirmed: false })
    expect(onSaved.mock.calls[0][0].confirmError).toBeDefined()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  describe('nháp cũ có dòng chưa có bên bán (suy từ đầu phiếu)', () => {
    const legacyDraft: ImportForm = {
      ...draftForm,
      items: [
        draftForm.items![0],
        {
          ...draftForm.items![0],
          slug: 'it-2',
          lineNo: 2,
          materialSlug: 'm-sugar',
          materialCode: 'VT-02',
          materialName: 'Đường',
          unitSlug: 'u-kg',
          unitCode: 'KG',
          unitName: 'Kilogram',
          supplierSlug: null,
          supplierCode: null,
          supplierName: null,
          supplierTaxCode: null,
          supplierAddress: null,
          quantity: 1,
          conversionRate: 1,
          baseQuantity: 1,
          unitPrice: 1000,
          amount: 1000,
        },
      ],
    }

    it('"Lưu & xác nhận" vẫn PATCH để lưu bên bán suy ra, rồi xác nhận với version mới', async () => {
      const order: string[] = []
      let patchBody: unknown
      let confirmBody: unknown
      server.use(
        mswHttp.patch(`${URL_W}/if-1`, async ({ request }) => {
          order.push('patch')
          patchBody = await request.json()
          return ok({ ...legacyDraft, version: 4 })
        }),
        mswHttp.post(`${URL_W}/if-1/confirm`, async ({ request }) => {
          order.push('confirm')
          confirmBody = await request.json()
          return ok({ ...confirmedForm, version: 5 })
        }),
      )
      const { user, onSaved } = setup({
        formSlug: 'if-1',
        detail: legacyDraft,
        canPickSupplier: true,
        canConfirm: true,
      })
      await screen.findByRole('textbox', { name: /^Số hoá đơn/ })
      await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
      await waitFor(() => expect(onSaved).toHaveBeenCalled())
      expect(order).toEqual(['patch', 'confirm'])
      const items = (patchBody as { items: { supplierSlug?: string }[] }).items
      expect(items[0].supplierSlug).toBe('s-1')
      expect(items[1].supplierSlug).toBe('s-1')
      expect(confirmBody).toEqual({ version: 4 })
    })

    it('nút "Lưu" không bị khoá dù chưa sửa ô nào', async () => {
      setup({ formSlug: 'if-1', detail: legacyDraft, canPickSupplier: true, canConfirm: true })
      await screen.findByRole('textbox', { name: /^Số hoá đơn/ })
      await waitFor(() => expect(saveButton()).toBeEnabled())
    })

    it('không có quyền chọn NCC → giữ nguyên, "Lưu" vẫn khoá khi chưa đổi', async () => {
      setup({ formSlug: 'if-1', detail: legacyDraft, canConfirm: true })
      await screen.findByRole('textbox', { name: /^Số hoá đơn/ })
      expect(saveButton()).toBeDisabled()
    })
  })

  it('sửa: 409 khi PATCH của "Lưu & xác nhận" → như nhánh cũ, không xác nhận', async () => {
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id')
    let confirms = 0
    server.use(
      mswHttp.patch(`${URL_W}/if-1`, () => apiError(409, 100800, 'conflict')),
      mswHttp.post(`${URL_W}/if-1/confirm`, () => {
        confirms += 1
        return ok(confirmedForm)
      }),
    )
    const { user, onOpenChange, onSaved } = setup({
      formSlug: 'if-1',
      detail: draftForm,
      canConfirm: true,
    })
    await user.clear(await noteBox())
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(errorSpy).toHaveBeenCalledWith(
      'Phiếu vừa bị người khác thay đổi — đã tải lại bản mới nhất.',
    )
    expect(confirms).toBe(0)
    expect(onSaved).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
