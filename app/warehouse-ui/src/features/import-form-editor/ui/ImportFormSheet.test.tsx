import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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
      expiryDate: null,
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

type User = ReturnType<typeof setup>['user']

const saveButton = () => screen.getByRole('button', { name: 'Lưu' })
const invoiceBox = () => screen.getByRole('textbox', { name: /^Số hoá đơn/ })
const stepsNav = () => screen.getByRole('navigation', { name: 'Các bước lập phiếu' })
const reviewHeading = () => screen.queryByRole('heading', { name: 'Kiểm tra phiếu nhập' })
const materialBox = () => screen.queryByRole('combobox', { name: 'Vật tư dòng 1' })

/** Sửa mở ở bước ②; ô Ghi chú nằm ở bước ① nên phải về ① trước (lùi luôn được). */
async function noteBox(user: User) {
  await user.click(await screen.findByRole('button', { name: /Thông tin phiếu$/ }))
  return screen.findByRole('textbox', { name: /^Ghi chú$/ })
}
/** Sửa: chi tiết đã về và form đã hiện (bước ②). */
const editLoaded = () => screen.findByRole('combobox', { name: 'Vật tư dòng 1' })

async function fillInfo(user: User) {
  await user.type(await screen.findByRole('textbox', { name: /^Số hoá đơn/ }), 'HD-9')
}
async function next(user: User) {
  await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
}
async function fillLine(user: User) {
  await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' }))
  await user.click(await screen.findByRole('option', { name: /VT-01 · Bột mì/ }))
  await user.type(screen.getByRole('textbox', { name: 'Số lượng dòng 1' }), '5')
  await user.type(screen.getByRole('textbox', { name: 'Đơn giá dòng 1' }), '1000')
}
/** Tạo: đi hết ① → ② → ③. */
async function toReview(user: User) {
  await fillInfo(user)
  await next(user)
  await fillLine(user)
  await next(user)
  await waitFor(() => expect(reviewHeading()).toBeVisible())
}

/** Hộp thêm vật tư giả: trả về vật tư ngoài danh sách `available-materials`, kèm đơn vị gốc. */
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
/** Ở ②: dòng 1 = Xi măng (thêm qua hộp giả), số lượng 5, đơn giá `price`. */
async function addCementLine(user: User, price: string) {
  await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' }))
  await user.click(await screen.findByRole('button', { name: /Thêm vật tư vào kho/ }))
  await user.click(await screen.findByRole('button', { name: 'Gắn giả' }))
  await user.type(screen.getByRole('textbox', { name: 'Số lượng dòng 1' }), '5')
  await user.type(screen.getByRole('textbox', { name: 'Đơn giá dòng 1' }), price)
}

describe('ImportFormSheet', () => {
  it('tạo: mở sheet rộng, tiêu đề có tên kho', async () => {
    setup()
    const dialog = await screen.findByRole('dialog', { name: 'Tạo phiếu nhập · Kho A' })
    expect(dialog.className).toContain('data-[side=right]:sm:max-w-5xl')
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

  it('tạo: mở lại sheet thì form về trạng thái trống', async () => {
    const { user, reopen } = setup()
    const invoice = await screen.findByRole('textbox', { name: /^Số hoá đơn/ })
    await user.type(invoice, 'HD-9')
    reopen(false)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    reopen(true)
    expect(await screen.findByRole('textbox', { name: /^Số hoá đơn/ })).toHaveValue('')
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
    expect(await screen.findByRole('textbox', { name: /^Số hoá đơn/, hidden: true })).toHaveValue(
      'HD-123',
    )
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
    await user.clear(await noteBox(user))
    await user.click(saveButton())
    await confirmDialog(user, 'Lưu thay đổi')
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
    expect(
      screen.queryByRole('textbox', { name: /^Số hoá đơn/, hidden: true }),
    ).not.toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByRole('textbox', { name: /^Số hoá đơn/, hidden: true })).toHaveValue(
      'HD-123',
    )
    expect(calls).toBe(2)
  })

  it('sửa: phiếu không còn là Nháp → hiện câu không sửa được, không render form', async () => {
    setup({ formSlug: 'if-1', detail: { ...draftForm, status: 'CONFIRMED' } })
    expect(await screen.findByText(/không còn ở trạng thái Nháp/)).toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: /^Số hoá đơn/, hidden: true }),
    ).not.toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('available-materials lỗi → hiện alert kèm Thử lại ở bước ②; bấm Thử lại thì nạp lại', async () => {
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
    await fillInfo(user)
    await next(user)
    const alert = await screen.findByRole('alert')
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(calls).toBe(2))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' }))
    expect(await screen.findByRole('option', { name: /VT-01 · Bột mì/ })).toBeInTheDocument()
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
    await user.clear(await noteBox(user))
    await user.click(saveButton())
    await confirmDialog(user, 'Lưu thay đổi')
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
    await user.clear(await noteBox(user))
    await user.click(saveButton())
    await confirmDialog(user, 'Lưu thay đổi')
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
    await user.clear(await noteBox(user))
    const save = saveButton()
    expect(save).toBeEnabled()
    await user.upload(screen.getByLabelText('Chứng từ đính kèm'), new File(['x'], 'a.pdf'))
    await waitFor(() => expect(save).toBeDisabled())
    release()
    await waitFor(() => expect(save).toBeEnabled())
  })

  it('đã sửa mà bấm Huỷ → hỏi "Bỏ thay đổi chưa lưu?"; Tiếp tục sửa thì ở lại', async () => {
    const { user, onOpenChange } = setup({ formSlug: 'if-1', detail: draftForm })
    await user.clear(await noteBox(user))
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Bỏ thay đổi chưa lưu?')
    await user.click(within(dialog).getByRole('button', { name: 'Tiếp tục sửa' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('đã sửa → Bỏ thay đổi thì đóng sheet', async () => {
    const { user, onOpenChange } = setup({ formSlug: 'if-1', detail: draftForm })
    await user.clear(await noteBox(user))
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))
    await confirmDialog(user, 'Bỏ thay đổi')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('tạo: đã nhập mà bấm Huỷ ở bước ① → hỏi "Bỏ thay đổi chưa lưu?"', async () => {
    const { user, onOpenChange } = setup()
    await fillInfo(user)
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Bỏ thay đổi chưa lưu?')
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('đóng tab: chỉ cảnh báo khi sheet mở và form đã sửa', async () => {
    const { user, reopen } = setup({ formSlug: 'if-1', detail: draftForm })
    const fire = () => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    await noteBox(user)
    expect(fire()).toBe(false)
    await user.type(await noteBox(user), 'x')
    expect(fire()).toBe(true)
    reopen(false)
    await waitFor(() => expect(fire()).toBe(false))
  })
})

describe('ImportFormSheet - wizard tạo mới', () => {
  it('mở ở bước ①: Số hoá đơn thấy được, bảng dòng ẩn, ① là bước hiện tại', async () => {
    setup()
    expect(await screen.findByRole('textbox', { name: /^Số hoá đơn/ })).toBeVisible()
    // Bảng dòng đã mount (ẩn) — chờ nó rồi mới khẳng định nó không hiện.
    await screen.findByRole('combobox', { name: 'Vật tư dòng 1', hidden: true })
    expect(materialBox()).not.toBeInTheDocument()
    expect(reviewHeading()).not.toBeInTheDocument()
    expect(within(stepsNav()).getByRole('button', { name: '① Thông tin phiếu' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.queryByRole('button', { name: 'Lưu nháp' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeInTheDocument()
  })

  it('Tiếp tục khi thiếu số HĐ → ở lại ①, lỗi tại ô Số hoá đơn và ô có focus', async () => {
    const { user } = setup()
    await screen.findByRole('textbox', { name: /^Số hoá đơn/ })
    await next(user)
    expect(await screen.findByText('Nhập số hoá đơn')).toBeInTheDocument()
    await waitFor(() => expect(invoiceBox()).toHaveFocus())
    expect(materialBox()).not.toBeInTheDocument()
  })

  it('① hợp lệ → Tiếp tục → ② có dòng tóm tắt; "sửa" → về ①, focus tiêu đề bước', async () => {
    const { user } = setup()
    await fillInfo(user)
    await next(user)
    expect(await screen.findByText(/^HĐ HD-9 · /)).toBeVisible()
    expect(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' })).toBeVisible()
    expect(screen.queryByRole('textbox', { name: /^Số hoá đơn/ })).not.toBeInTheDocument()
    expect(within(stepsNav()).getByRole('button', { name: /Chi tiết vật tư$/ })).toHaveAttribute(
      'aria-current',
      'step',
    )
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Chi tiết vật tư' })).toHaveFocus(),
    )
    await user.click(screen.getByRole('button', { name: 'sửa' }))
    expect(invoiceBox()).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Thông tin phiếu' })).toHaveFocus()
  })

  it('② thiếu vật tư → ở lại ②, lỗi tại dòng; đủ → ③ hiện bảng dòng + tóm tắt, chân có Tổng', async () => {
    const { user } = setup()
    await fillInfo(user)
    await next(user)
    await screen.findByRole('combobox', { name: 'Vật tư dòng 1' })
    await next(user)
    await waitFor(() => expect(materialBox()).toHaveAttribute('aria-invalid', 'true'))
    expect(reviewHeading()).not.toBeInTheDocument()
    await fillLine(user)
    await next(user)
    await waitFor(() => expect(reviewHeading()).toBeVisible())
    expect(screen.getByRole('cell', { name: 'VT-01 · Bột mì' })).toBeVisible()
    expect(screen.getByRole('cell', { name: '5 KG' })).toBeVisible()
    expect(materialBox()).not.toBeInTheDocument()
    expect(screen.getByText(/^Tổng:/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quay lại' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tiếp tục' })).not.toBeInTheDocument()
  })

  it('③ "Quay lại" → ②, giữ nguyên dòng, không gọi API', async () => {
    let posts = 0
    server.use(
      mswHttp.post(URL_W, () => {
        posts += 1
        return ok(draftForm)
      }),
    )
    const { user } = setup()
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Quay lại' }))
    expect(await screen.findByRole('textbox', { name: 'Số lượng dòng 1' })).toHaveValue('5')
    expect(reviewHeading()).not.toBeInTheDocument()
    expect(posts).toBe(0)
  })

  it('③ Lưu nháp → POST đúng body → đóng sheet + onSaved; không có "Lưu & xác nhận"; hook không toast', async () => {
    const successSpy = vi.spyOn(toast, 'success').mockImplementation(() => 'id')
    let body: unknown
    server.use(
      mswHttp.post(URL_W, async ({ request }) => {
        body = await request.json()
        return ok(draftForm)
      }),
    )
    const { user, onSaved, onOpenChange } = setup()
    await toReview(user)
    expect(screen.queryByRole('button', { name: 'Lưu & xác nhận' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await confirmDialog(user, 'Lưu nháp')
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ form: draftForm, confirmed: false }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(body).toMatchObject({
      invoiceCode: 'HD-9',
      items: [{ materialSlug: 'm-flour', unitSlug: 'u-kg', quantity: 5, unitPrice: 1000 }],
    })
    expect((body as { code: string }).code).toMatch(/^PN-\d{8}-\d{4}$/)
    expect(successSpy).not.toHaveBeenCalled()
    successSpy.mockRestore()
  })

  it('③ đang gửi POST → mọi nút ở chân bị khoá, Esc không đóng sheet', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    server.use(
      mswHttp.post(URL_W, async () => {
        await gate
        return ok(draftForm)
      }),
    )
    const { user, onSaved, onOpenChange } = setup({ canConfirm: true })
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await confirmDialog(user, 'Lưu nháp')
    // Hộp hỏi vẫn mở (khoá) khi đang gửi; chân sheet nằm sau nó (`aria-hidden`) nên tìm với `hidden: true`.
    const footer = within(document.querySelector<HTMLElement>('[data-slot="sheet-footer"]')!)
    // Chỉ nút vừa bấm đổi chữ thành "Đang lưu..."; nút kia giữ chữ, bị khoá.
    await waitFor(() =>
      expect(footer.getByRole('button', { name: 'Đang lưu...', hidden: true })).toBeDisabled(),
    )
    expect(footer.queryByRole('button', { name: 'Lưu nháp', hidden: true })).not.toBeInTheDocument()
    expect(footer.getByRole('button', { name: 'Lưu & xác nhận', hidden: true })).toBeDisabled()
    expect(footer.getByRole('button', { name: 'Quay lại', hidden: true })).toBeDisabled()
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByRole('button', { name: 'Đang lưu...' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Quay lại' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    release()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('③ không có quyền xác nhận: đang gửi thì nút chính "Lưu nháp" đổi thành "Đang lưu..."', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    server.use(
      mswHttp.post(URL_W, async () => {
        await gate
        return ok(draftForm)
      }),
    )
    const { user, onSaved } = setup()
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await confirmDialog(user, 'Lưu nháp')
    // Chân sheet nằm sau hộp hỏi đang mở (`aria-hidden`).
    const footer = within(document.querySelector<HTMLElement>('[data-slot="sheet-footer"]')!)
    await waitFor(() =>
      expect(footer.getByRole('button', { name: 'Đang lưu...', hidden: true })).toBeDisabled(),
    )
    expect(footer.queryByRole('button', { name: 'Lưu nháp', hidden: true })).not.toBeInTheDocument()
    release()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('MANAGER ③ "Lưu & xác nhận" → POST rồi xác nhận với version phiếu vừa tạo', async () => {
    const successSpy = vi.spyOn(toast, 'success').mockImplementation(() => 'id')
    const confirmedForm: ImportForm = { ...draftForm, status: 'CONFIRMED', version: 4 }
    let confirmBody: unknown
    server.use(
      mswHttp.post(URL_W, () => ok(draftForm)),
      mswHttp.post(`${URL_W}/if-1/confirm`, async ({ request }) => {
        confirmBody = await request.json()
        return ok(confirmedForm)
      }),
    )
    const { user, onSaved, onOpenChange } = setup({ canConfirm: true })
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    await confirmDialog(user, 'Lưu & xác nhận')
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({ form: confirmedForm, confirmed: true }),
    )
    expect(confirmBody).toEqual({ version: 3 })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(successSpy).not.toHaveBeenCalled()
    successSpy.mockRestore()
  })

  it('MANAGER ③ "Lưu & xác nhận" thành công → làm mới tồn + lô của kho', async () => {
    const confirmedForm: ImportForm = { ...draftForm, status: 'CONFIRMED', version: 4 }
    server.use(
      mswHttp.post(URL_W, () => ok(draftForm)),
      mswHttp.post(`${URL_W}/if-1/confirm`, () => ok(confirmedForm)),
    )
    const { user, onSaved, queryClient } = setup({ canConfirm: true })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    await confirmDialog(user, 'Lưu & xác nhận')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const keys = invalidate.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toContainEqual(['inventory'])
    expect(keys).toContainEqual(['material-batches', 'w-a'])
  })

  it('③ xác nhận trả 500 → phiếu nháp vẫn được lưu, onSaved kèm confirmError, sheet đóng', async () => {
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id')
    server.use(
      mswHttp.post(URL_W, () => ok(draftForm)),
      mswHttp.post(`${URL_W}/if-1/confirm`, () => apiError(500, 100500, 'Internal error')),
    )
    const { user, onSaved, onOpenChange } = setup({ canConfirm: true })
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    await confirmDialog(user, 'Lưu & xác nhận')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onSaved.mock.calls[0][0]).toMatchObject({ form: draftForm, confirmed: false })
    expect(onSaved.mock.calls[0][0].confirmError).toBeDefined()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('bấm thẳng ③ trên dải bước khi ① sai → ở lại ①, lỗi tại ô', async () => {
    const { user } = setup()
    await screen.findByRole('textbox', { name: /^Số hoá đơn/ })
    await user.click(within(stepsNav()).getByRole('button', { name: '③ Kiểm tra & lưu' }))
    expect(await screen.findByText('Nhập số hoá đơn')).toBeInTheDocument()
    await waitFor(() => expect(invoiceBox()).toHaveFocus())
    expect(reviewHeading()).not.toBeInTheDocument()
  })

  it('③ "sửa" ở cảnh báo đơn giá 0 → về ②, ô Đơn giá dòng đó có focus', async () => {
    const { user } = setup()
    await fillInfo(user)
    await next(user)
    await fillLine(user)
    const price = screen.getByRole('textbox', { name: 'Đơn giá dòng 1' })
    await user.clear(price)
    await user.type(price, '0')
    await next(user)
    expect(await screen.findByText('Cần xem lại (1)')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'sửa' }))
    await waitFor(() => expect(price).toHaveFocus())
    expect(reviewHeading()).not.toBeInTheDocument()
  })

  it('③ vật tư vừa thêm từ hộp (ngoài danh sách) → cảnh báo đơn giá 0 vẫn có tên của dòng', async () => {
    const { user } = setup({ AddMaterialDialog: FakeAddDialog })
    await fillInfo(user)
    await next(user)
    await addCementLine(user, '0')
    await next(user)
    expect(await screen.findByText('Dòng 1 · VT-09 · Xi măng — đơn giá 0')).toBeVisible()
    expect(screen.getByRole('cell', { name: 'VT-09 · Xi măng' })).toBeVisible()
  })

  it('③ vật tư vừa thêm từ hộp (ngoài danh sách) → bảng dòng có mã đơn vị gốc hộp trả về', async () => {
    const { user } = setup({ AddMaterialDialog: FakeAddDialog })
    await fillInfo(user)
    await next(user)
    await addCementLine(user, '1000')
    await next(user)
    await waitFor(() => expect(reviewHeading()).toBeVisible())
    expect(screen.getByRole('cell', { name: '5 KG' })).toBeVisible()
  })

  it('① sai rồi sửa → Tiếp tục: ② không còn lỗi "Chọn vật tư" sót lại từ lần gửi khan', async () => {
    const { user } = setup()
    await screen.findByRole('textbox', { name: /^Số hoá đơn/ })
    await next(user)
    expect(await screen.findByText('Nhập số hoá đơn')).toBeInTheDocument()
    await fillInfo(user)
    await next(user)
    expect(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' })).toBeVisible()
    expect(materialBox()).not.toHaveAttribute('aria-invalid', 'true')
    // "Chọn vật tư" cũng là placeholder của ô — chỉ tìm câu lỗi.
    expect(
      screen.queryByText('Chọn vật tư', { selector: '[data-slot="form-message"]' }),
    ).not.toBeInTheDocument()
  })

  it('đang upload chứng từ → Tiếp tục không sang ②; upload xong thì sang được', async () => {
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
    const { user } = setup()
    await fillInfo(user)
    await user.upload(screen.getByLabelText('Chứng từ đính kèm'), new File(['x'], 'a.pdf'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled())
    await user.click(within(stepsNav()).getByRole('button', { name: /Chi tiết vật tư$/ }))
    await new Promise((r) => setTimeout(r, 50))
    expect(materialBox()).not.toBeInTheDocument()
    expect(invoiceBox()).toBeVisible()
    release()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeEnabled())
    await next(user)
    expect(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' })).toBeVisible()
  })

  it('③ POST trả 101304 (trùng mã) → về ①, ô Mã phiếu báo lỗi và có focus, sheet vẫn mở', async () => {
    server.use(mswHttp.post(URL_W, () => apiError(400, 101304, 'Import form code does exist')))
    const { user, onOpenChange } = setup()
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await confirmDialog(user, 'Lưu nháp')
    expect(await screen.findByText('Mã phiếu đã tồn tại')).toBeVisible()
    await waitFor(() => expect(screen.getByRole('textbox', { name: /^Mã phiếu/ })).toHaveFocus())
    expect(reviewHeading()).not.toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('③ "Lưu & xác nhận" mà tạo lỗi → không xác nhận, lỗi tại ô, onSaved không gọi', async () => {
    let confirms = 0
    server.use(
      mswHttp.post(URL_W, () => apiError(400, 101304, 'Import form code does exist')),
      mswHttp.post(`${URL_W}/if-1/confirm`, () => {
        confirms += 1
        return ok(draftForm)
      }),
    )
    const { user, onSaved } = setup({ canConfirm: true })
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    await confirmDialog(user, 'Lưu & xác nhận')
    expect(await screen.findByText('Mã phiếu đã tồn tại')).toBeInTheDocument()
    expect(confirms).toBe(0)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('③ POST trả lỗi theo dòng (101324, không có chỉ số) → toast như cũ và về ②', async () => {
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id')
    server.use(mswHttp.post(URL_W, () => apiError(400, 101324, 'Item duplicated')))
    const { user } = setup()
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await confirmDialog(user, 'Lưu nháp')
    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(materialBox()).toBeVisible())
    expect(reviewHeading()).not.toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('③ POST trả 101333 (hạn dùng của dòng) → toast và về ②', async () => {
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id')
    server.use(mswHttp.post(URL_W, () => apiError(400, 101333, 'Item expiry date invalid')))
    const { user } = setup()
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await confirmDialog(user, 'Lưu nháp')
    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(materialBox()).toBeVisible())
    expect(reviewHeading()).not.toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('hạn dùng: sửa phiếu có hạn → ô hiện ngày, PATCH gửi lại expiryDate', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${URL_W}/if-1`, async ({ request }) => {
        body = await request.json()
        return ok({ ...draftForm, version: 4 })
      }),
    )
    const withExpiry = {
      ...draftForm,
      items: [{ ...draftForm.items![0], expiryDate: '2027-01-31' }],
    }
    const { user, onSaved } = setup({ formSlug: 'if-1', detail: withExpiry })
    await editLoaded()
    expect(screen.getByRole('button', { name: 'Hạn dùng dòng 1' })).toHaveTextContent('31/01/2027')
    await user.clear(await noteBox(user))
    await user.click(saveButton())
    await confirmDialog(user, 'Lưu thay đổi')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(body).toMatchObject({ items: [{ expiryDate: '2027-01-31' }] })
  })

  it('hạn dùng: trước ngày nhập → lỗi tại ô dòng 1, ở lại ②', async () => {
    const early = {
      ...draftForm,
      items: [{ ...draftForm.items![0], expiryDate: '2026-10-01' }],
    }
    const { user } = setup({ formSlug: 'if-1', detail: early })
    await editLoaded()
    await user.click(screen.getByRole('button', { name: '③ Kiểm tra & lưu' }))
    expect(await screen.findByText('Hạn dùng không được trước ngày nhập')).toBeVisible()
    expect(reviewHeading()).not.toBeInTheDocument()
  })

  it('hạn dùng: lỗi đang hiện thì đổi ngày nhập về ≤ hạn → lỗi tự biến mất', async () => {
    const early = {
      ...draftForm,
      items: [{ ...draftForm.items![0], expiryDate: '2026-10-01' }],
    }
    const { user } = setup({ formSlug: 'if-1', detail: early })
    await editLoaded()
    await user.click(screen.getByRole('button', { name: '③ Kiểm tra & lưu' }))
    await screen.findByText('Hạn dùng không được trước ngày nhập')
    await user.click(await screen.findByRole('button', { name: /Thông tin phiếu$/ }))
    await user.click(await screen.findByRole('button', { name: /^Ngày nhập/ }))
    await user.click(within(await screen.findByRole('grid')).getAllByText('1')[0])
    await user.click(await screen.findByRole('button', { name: /Chi tiết vật tư/ }))
    await screen.findByRole('combobox', { name: 'Vật tư dòng 1' })
    expect(screen.queryByText('Hạn dùng không được trước ngày nhập')).not.toBeInTheDocument()
  })

  it('③ POST trả 101330 (bên bán của dòng không hợp lệ) → toast và về ②', async () => {
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id')
    server.use(mswHttp.post(URL_W, () => apiError(400, 101330, 'Item supplier invalid')))
    const { user } = setup()
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await confirmDialog(user, 'Lưu nháp')
    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(materialBox()).toBeVisible())
    expect(reviewHeading()).not.toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('nhập dòng ở ②, về ① đổi ghi chú rồi Tiếp tục → dòng vẫn giữ vật tư / số lượng / đơn giá', async () => {
    const { user } = setup()
    await fillInfo(user)
    await next(user)
    await fillLine(user)
    await user.click(screen.getByRole('button', { name: 'sửa' }))
    await user.type(screen.getByRole('textbox', { name: /^Ghi chú$/ }), 'Giao chiều')
    await next(user)
    expect(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' })).toHaveTextContent(
      'VT-01 · Bột mì',
    )
    expect(screen.getByRole('textbox', { name: 'Số lượng dòng 1' })).toHaveValue('5')
    expect(screen.getByRole('textbox', { name: 'Đơn giá dòng 1' })).toHaveValue('1.000')
  })

  it('Enter trong ô Số hoá đơn → sang ②, không POST; ở ③ gửi form → không POST, vẫn ở ③', async () => {
    let posts = 0
    server.use(
      mswHttp.post(URL_W, () => {
        posts += 1
        return ok(draftForm)
      }),
    )
    const { user } = setup()
    await user.type(await screen.findByRole('textbox', { name: /^Số hoá đơn/ }), 'HD-9{Enter}')
    expect(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' })).toBeVisible()
    await fillLine(user)
    await next(user)
    await waitFor(() => expect(reviewHeading()).toBeVisible())
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
    await new Promise((r) => setTimeout(r, 50))
    expect(posts).toBe(0)
    expect(reviewHeading()).toBeVisible()
  })

  it('đang ở ③, đóng rồi mở lại sheet → về ①', async () => {
    const { user, reopen } = setup()
    await toReview(user)
    reopen(false)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    reopen(true)
    expect(await screen.findByRole('textbox', { name: /^Số hoá đơn/ })).toBeVisible()
    expect(reviewHeading()).not.toBeInTheDocument()
    expect(within(stepsNav()).getByRole('button', { name: '① Thông tin phiếu' })).toHaveAttribute(
      'aria-current',
      'step',
    )
  })
})

describe('ImportFormSheet - đầu phiếu bên bán', () => {
  it('có quyền chọn NCC: có ô Bên bán bắt buộc, trống thì Tiếp tục báo lỗi tại ô', async () => {
    const { user } = setup({ canPickSupplier: true })
    expect(await screen.findByRole('combobox', { name: /Bên bán/ })).toBeInTheDocument()
    await fillInfo(user)
    await next(user)
    // Placeholder của ô và thông báo lỗi dùng chung chữ "Chọn bên bán".
    await waitFor(() => expect(screen.getAllByText('Chọn bên bán')).toHaveLength(2))
    expect(screen.getByRole('combobox', { name: /Bên bán/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(materialBox()).not.toBeInTheDocument()
  })

  it('có bên bán: tóm tắt ở ② ghi "Mua của <bên bán>"', async () => {
    const { user } = setup({ canPickSupplier: true })
    await user.click(await screen.findByRole('combobox', { name: /Bên bán/ }))
    await user.click(await screen.findByText('NCC-01 · NCC Bột'))
    await fillInfo(user)
    await next(user)
    expect(await screen.findByText(/^Mua của NCC Bột · HĐ HD-9 · /)).toBeVisible()
  })

  it('không có quyền chọn NCC: không có ô Bên bán, đi tới ③ không bị chặn vì bên bán', async () => {
    const { user } = setup()
    await screen.findByRole('textbox', { name: /^Số hoá đơn/ })
    expect(screen.queryByRole('combobox', { name: /Bên bán/ })).not.toBeInTheDocument()
    await toReview(user)
  })

  it('đổi bên bán khi 2 dòng đã chọn vật tư → báo số dòng; sửa ô khác thì mất', async () => {
    const { user } = setup({ canPickSupplier: true })
    const seller = await screen.findByRole('combobox', { name: /Bên bán/ })
    await user.click(seller)
    await user.click(await screen.findByText('NCC-01 · NCC Bột'))
    await fillInfo(user)
    await next(user)
    await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' }))
    await user.click(await screen.findByRole('option', { name: /VT-01 · Bột mì/ }))
    await user.click(screen.getByRole('button', { name: 'Thêm dòng' }))
    await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 2' }))
    await user.click(await screen.findByRole('option', { name: /VT-02 · Đường/ }))
    await user.click(screen.getByRole('button', { name: 'sửa' }))
    await user.click(screen.getByRole('combobox', { name: /Bên bán/ }))
    await user.click(await screen.findByText('NCC-02 · NCC Đường'))
    expect(await screen.findByText('Đã đổi bên bán cho 2 dòng')).toBeInTheDocument()
    await user.type(invoiceBox(), 'H')
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
    await fillInfo(user)
    await next(user)
    await fillLine(user)
    expect(
      await within(nav).findByRole('button', { name: 'Đã xong: Thông tin phiếu' }),
    ).toBeInTheDocument()
    expect(
      within(nav).getByRole('button', { name: 'Đã xong: Chi tiết vật tư · 1 dòng' }),
    ).toBeInTheDocument()
  })

  it('sửa: bấm "③ Kiểm tra & lưu" hiện trang Kiểm tra, không gửi PATCH', async () => {
    let patches = 0
    server.use(
      mswHttp.patch(`${URL_W}/if-1`, () => {
        patches += 1
        return ok({ ...draftForm, version: 4 })
      }),
    )
    const { user, onOpenChange, onSaved } = setup({ formSlug: 'if-1', detail: draftForm })
    await user.clear(await noteBox(user))
    await user.click(screen.getByRole('button', { name: '③ Kiểm tra & lưu' }))
    await waitFor(() => expect(reviewHeading()).toBeVisible())
    expect(screen.getByRole('cell', { name: 'VT-01 · Bột mì' })).toBeVisible()
    expect(screen.getByRole('cell', { name: '10 BAG' })).toBeVisible()
    await new Promise((r) => setTimeout(r, 50))
    expect(patches).toBe(0)
    expect(onSaved).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByRole('dialog', { name: 'Sửa phiếu nhập PN-0001' })).toBeInTheDocument()
  })
})

describe('ImportFormSheet - wizard sửa', () => {
  const footerButtons = () =>
    within(document.querySelector<HTMLElement>('[data-slot="sheet-footer"]')!)
      .getAllByRole('button')
      .map((b) => b.textContent)
  const quantityBox = () => screen.getByRole('textbox', { name: 'Số lượng dòng 1' })
  /** Phiếu nháp mà số HĐ trống — lỗi nằm ở bước ① trong khi sửa mở ở ②. */
  const noInvoice: ImportForm = { ...draftForm, invoiceCode: '' }

  it('mở ở bước ②: bảng dòng thấy được, ② là bước hiện tại, tóm tắt có bên bán suy ra + số HĐ', async () => {
    setup({ formSlug: 'if-1', detail: draftForm, canPickSupplier: true })
    expect(await editLoaded()).toBeVisible()
    expect(within(stepsNav()).getByRole('button', { name: /Chi tiết vật tư/ })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(await screen.findByText(/^Mua của NCC Bột · HĐ HD-123 · /)).toBeVisible()
    expect(screen.queryByRole('textbox', { name: /^Số hoá đơn/ })).not.toBeInTheDocument()
  })

  it('chân sheet ở mọi bước: Huỷ · Lưu & xác nhận · Lưu (không Quay lại / Tiếp tục), có Tổng', async () => {
    const { user } = setup({ formSlug: 'if-1', detail: draftForm, canConfirm: true })
    await editLoaded()
    const expected = ['Huỷ', 'Lưu & xác nhận', 'Lưu']
    expect(footerButtons()).toEqual(expected)
    expect(screen.getByText(/^Tổng:/)).toBeInTheDocument()
    await user.click(within(stepsNav()).getByRole('button', { name: /Thông tin phiếu$/ }))
    expect(await screen.findByRole('textbox', { name: /^Số hoá đơn/ })).toBeVisible()
    expect(footerButtons()).toEqual(expected)
    await user.click(within(stepsNav()).getByRole('button', { name: /Kiểm tra & lưu$/ }))
    await waitFor(() => expect(reviewHeading()).toBeVisible())
    expect(footerButtons()).toEqual(expected)
  })

  it('Lưu ở ② sau khi đổi số lượng → PATCH số lượng mới, onSaved; chưa đổi thì Lưu khoá', async () => {
    let body: { items: { quantity: number }[] } | undefined
    server.use(
      mswHttp.patch(`${URL_W}/if-1`, async ({ request }) => {
        body = (await request.json()) as typeof body
        return ok({ ...draftForm, version: 4 })
      }),
    )
    const { user, onSaved } = setup({ formSlug: 'if-1', detail: draftForm })
    await editLoaded()
    expect(saveButton()).toBeDisabled()
    await user.clear(quantityBox())
    await user.type(quantityBox(), '12')
    await user.click(saveButton())
    await confirmDialog(user, 'Lưu thay đổi')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(body?.items[0].quantity).toBe(12)
  })

  it('Enter trong ô ở ② = Lưu → PATCH', async () => {
    let patches = 0
    server.use(
      mswHttp.patch(`${URL_W}/if-1`, () => {
        patches += 1
        return ok({ ...draftForm, version: 4 })
      }),
    )
    const { user, onSaved } = setup({ formSlug: 'if-1', detail: draftForm })
    await editLoaded()
    await user.clear(quantityBox())
    await user.type(quantityBox(), '12{Enter}')
    await confirmDialog(user, 'Lưu thay đổi')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(patches).toBe(1)
  })

  it('lỗi ở bước ① đang ẩn (số HĐ trống) → Lưu ở ② chuyển về ①, lỗi + focus ô Số hoá đơn, không PATCH', async () => {
    let patches = 0
    server.use(
      mswHttp.patch(`${URL_W}/if-1`, () => {
        patches += 1
        return ok(draftForm)
      }),
    )
    const { user, onSaved } = setup({ formSlug: 'if-1', detail: noInvoice })
    await editLoaded()
    await user.clear(quantityBox())
    await user.type(quantityBox(), '12')
    await user.click(saveButton())
    expect(await screen.findByText('Nhập số hoá đơn')).toBeVisible()
    await waitFor(() => expect(invoiceBox()).toHaveFocus())
    // Không hợp lệ → không mở hộp hỏi lưu.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(within(stepsNav()).getByRole('button', { name: /Thông tin phiếu$/ })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(materialBox()).not.toBeInTheDocument()
    expect(patches).toBe(0)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('lỗi ở bước ① đang ẩn → "Lưu & xác nhận" ở ② cũng chuyển về ①, không PATCH, không xác nhận', async () => {
    let calls = 0
    server.use(
      mswHttp.patch(`${URL_W}/if-1`, () => {
        calls += 1
        return ok(draftForm)
      }),
      mswHttp.post(`${URL_W}/if-1/confirm`, () => {
        calls += 1
        return ok(draftForm)
      }),
    )
    const { user, onSaved } = setup({ formSlug: 'if-1', detail: noInvoice, canConfirm: true })
    await editLoaded()
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    expect(await screen.findByText('Nhập số hoá đơn')).toBeVisible()
    await waitFor(() => expect(invoiceBox()).toHaveFocus())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 50))
    expect(calls).toBe(0)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('đang ở ③, đóng rồi mở lại sheet → về ②', async () => {
    const { user, reopen } = setup({ formSlug: 'if-1', detail: draftForm })
    await editLoaded()
    await user.click(within(stepsNav()).getByRole('button', { name: /Kiểm tra & lưu$/ }))
    await waitFor(() => expect(reviewHeading()).toBeVisible())
    reopen(false)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    reopen(true)
    expect(await editLoaded()).toBeVisible()
    expect(reviewHeading()).not.toBeInTheDocument()
    expect(within(stepsNav()).getByRole('button', { name: /Chi tiết vật tư/ })).toHaveAttribute(
      'aria-current',
      'step',
    )
  })
})

describe('ImportFormSheet - sửa: lưu, lưu & xác nhận', () => {
  const confirmedForm: ImportForm = { ...draftForm, status: 'CONFIRMED', version: 4 }

  it('sửa: không có quyền xác nhận → không có "Lưu & xác nhận"', async () => {
    setup({ formSlug: 'if-1', detail: draftForm })
    await editLoaded()
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
    await editLoaded()
    expect(saveButton()).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    await confirmDialog(user, 'Lưu & xác nhận')
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
    await editLoaded()
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    await confirmDialog(user, 'Lưu & xác nhận')
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
    await editLoaded()
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    await confirmDialog(user, 'Lưu & xác nhận')
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
    await user.clear(await noteBox(user))
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    await confirmDialog(user, 'Lưu & xác nhận')
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
    await user.clear(await noteBox(user))
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    await confirmDialog(user, 'Lưu & xác nhận')
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
      await editLoaded()
      await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
      await confirmDialog(user, 'Lưu & xác nhận')
      await waitFor(() => expect(onSaved).toHaveBeenCalled())
      expect(order).toEqual(['patch', 'confirm'])
      const items = (patchBody as { items: { supplierSlug?: string }[] }).items
      expect(items[0].supplierSlug).toBe('s-1')
      expect(items[1].supplierSlug).toBe('s-1')
      expect(confirmBody).toEqual({ version: 4 })
    })

    it('nút "Lưu" không bị khoá dù chưa sửa ô nào', async () => {
      setup({ formSlug: 'if-1', detail: legacyDraft, canPickSupplier: true, canConfirm: true })
      await editLoaded()
      await waitFor(() => expect(saveButton()).toBeEnabled())
    })

    it('không có quyền chọn NCC → giữ nguyên, "Lưu" vẫn khoá khi chưa đổi', async () => {
      setup({ formSlug: 'if-1', detail: legacyDraft, canConfirm: true })
      await editLoaded()
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
    await user.clear(await noteBox(user))
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    await confirmDialog(user, 'Lưu & xác nhận')
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(errorSpy).toHaveBeenCalledWith(
      'Phiếu vừa bị người khác thay đổi — đã tải lại bản mới nhất.',
    )
    expect(confirms).toBe(0)
    expect(onSaved).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe('ImportFormSheet - đợt sửa cuối', () => {
  const footer = () => document.querySelector<HTMLElement>('[data-slot="sheet-footer"]')!
  // `hidden: true`: khi hộp hỏi lưu đang mở, phần còn lại của trang bị `aria-hidden` (hộp modal).
  const footerButtons = () =>
    within(footer())
      .getAllByRole('button', { hidden: true })
      .map((b) => b.textContent)
  const tick = () => new Promise((r) => setTimeout(r, 100))

  /** Đếm mọi request ghi (tạo / sửa / xác nhận). */
  function countWrites() {
    const calls: string[] = []
    server.use(
      mswHttp.post(URL_W, () => {
        calls.push('create')
        return ok(draftForm)
      }),
      mswHttp.patch(`${URL_W}/if-1`, () => {
        calls.push('patch')
        return ok({ ...draftForm, version: 4 })
      }),
      mswHttp.post(`${URL_W}/if-1/confirm`, () => {
        calls.push('confirm')
        return ok({ ...draftForm, status: 'CONFIRMED', version: 4 })
      }),
    )
    return calls
  }

  describe('C1: bấm đúp "Tiếp tục" không được lưu', () => {
    /** Tạo: tới ②, điền dòng; trả về nút "Tiếp tục" của ② trước khi bấm. */
    async function toItemsFilled(user: User) {
      await fillInfo(user)
      await next(user)
      await fillLine(user)
      return screen.getByRole('button', { name: 'Tiếp tục' })
    }

    for (const canConfirm of [false, true]) {
      const label = canConfirm ? 'Lưu & xác nhận' : 'Lưu nháp'
      it(`${canConfirm ? 'có' : 'không có'} quyền xác nhận: cú bấm thứ hai (detail 2) rơi vào "${label}" ở ③ → không POST`, async () => {
        const calls = countWrites()
        const { user, onSaved } = setup({ canConfirm })
        await user.click(await toItemsFilled(user))
        await waitFor(() => expect(reviewHeading()).toBeVisible())
        fireEvent.click(screen.getByRole('button', { name: label }), { detail: 2 })
        if (canConfirm)
          fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }), { detail: 2 })
        await tick()
        expect(calls).toEqual([])
        expect(onSaved).not.toHaveBeenCalled()
        expect(reviewHeading()).toBeVisible()
      })

      it(`${canConfirm ? 'có' : 'không có'} quyền xác nhận: "${label}" ở ③ là node mới, không phải node "Tiếp tục" của ②`, async () => {
        const { user } = setup({ canConfirm })
        const nextButton = await toItemsFilled(user)
        await user.click(nextButton)
        await waitFor(() => expect(reviewHeading()).toBeVisible())
        expect(screen.getByRole('button', { name: label })).not.toBe(nextButton)
        for (const b of within(footer()).getAllByRole('button')) expect(b).not.toBe(nextButton)
        expect(nextButton).not.toBeInTheDocument()
      })
    }

    it('kích hoạt bằng bàn phím (detail 0) vẫn lưu', async () => {
      const calls = countWrites()
      const { user, onSaved } = setup({ canConfirm: true })
      await toReview(user)
      fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }), { detail: 0 })
      await confirmDialog(user, 'Lưu nháp')
      await waitFor(() => expect(onSaved).toHaveBeenCalled())
      expect(calls).toEqual(['create'])
    })

    it('"Tiếp tục" bỏ qua cú bấm thứ hai (detail 2): ① ở yên', async () => {
      const { user } = setup()
      await fillInfo(user)
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }), { detail: 2 })
      await tick()
      expect(invoiceBox()).toBeVisible()
      expect(materialBox()).not.toBeInTheDocument()
    })

    it('sửa: "Lưu & xác nhận" bỏ qua cú bấm thứ hai (detail 2)', async () => {
      const calls = countWrites()
      const { onSaved } = setup({ formSlug: 'if-1', detail: draftForm, canConfirm: true })
      await editLoaded()
      fireEvent.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }), { detail: 2 })
      await tick()
      expect(calls).toEqual([])
      expect(onSaved).not.toHaveBeenCalled()
    })
  })

  describe('I1: chuyển bước rồi focus được ô lỗi là Combobox / DatePicker', () => {
    it('sửa nháp không có bên bán ở mọi dòng → "Lưu & xác nhận" ở ② về ①, ô Bên bán có focus', async () => {
      const calls = countWrites()
      const noSeller: ImportForm = {
        ...draftForm,
        items: [
          {
            ...draftForm.items![0],
            supplierSlug: null,
            supplierCode: null,
            supplierName: null,
            supplierTaxCode: null,
            supplierAddress: null,
          },
        ],
      }
      const { user } = setup({
        formSlug: 'if-1',
        detail: noSeller,
        canPickSupplier: true,
        canConfirm: true,
      })
      await editLoaded()
      await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
      const seller = await screen.findByRole('combobox', { name: /^Bên bán/ })
      await waitFor(() => expect(seller).toBeVisible())
      await waitFor(() => expect(seller).toHaveFocus())
      await tick()
      expect(seller).toHaveFocus()
      expect(calls).toEqual([])
    })

    it('③ khi tạo, backend trả 101310 → về ①, ô Ngày nhập có focus', async () => {
      server.use(mswHttp.post(URL_W, () => apiError(400, 101310, 'Date invalid')))
      const { user } = setup()
      await toReview(user)
      await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
      await confirmDialog(user, 'Lưu nháp')
      const date = await screen.findByRole('button', { name: /^Ngày nhập/ })
      await waitFor(() => expect(date).toBeVisible())
      await waitFor(() => expect(date).toHaveFocus())
      expect(reviewHeading()).not.toBeInTheDocument()
    })

    it('sửa: dòng 2 thiếu vật tư, bấm Lưu ở ① → sang ②, ô "Vật tư dòng 2" có focus', async () => {
      const calls = countWrites()
      const { user } = setup({ formSlug: 'if-1', detail: draftForm })
      await editLoaded()
      await user.click(screen.getByRole('button', { name: 'Thêm dòng' }))
      await user.click(within(stepsNav()).getByRole('button', { name: /Thông tin phiếu$/ }))
      await waitFor(() => expect(invoiceBox()).toBeVisible())
      await user.click(saveButton())
      const line2 = await screen.findByRole('combobox', { name: 'Vật tư dòng 2' })
      await waitFor(() => expect(line2).toBeVisible())
      await waitFor(() => expect(line2).toHaveFocus())
      await tick()
      expect(line2).toHaveFocus()
      expect(calls).toEqual([])
    })
  })

  describe('M1: sửa — chỉ nút vừa bấm hiện "Đang lưu..."', () => {
    it('"Lưu & xác nhận" đổi chữ, "Lưu" giữ chữ và bị khoá; "Lưu" thì ngược lại', async () => {
      let release: () => void = () => {}
      const gate = new Promise<void>((r) => (release = r))
      server.use(
        mswHttp.patch(`${URL_W}/if-1`, async () => {
          await gate
          return ok({ ...draftForm, version: 4 })
        }),
        mswHttp.post(`${URL_W}/if-1/confirm`, () =>
          ok({ ...draftForm, status: 'CONFIRMED', version: 5 }),
        ),
      )
      const { user, onSaved } = setup({ formSlug: 'if-1', detail: draftForm, canConfirm: true })
      await user.clear(await noteBox(user))
      await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
      await confirmDialog(user, 'Lưu & xác nhận')
      await waitFor(() => expect(footerButtons()).toEqual(['Huỷ', 'Đang lưu...', 'Lưu']))
      expect(screen.getByRole('button', { name: 'Lưu', hidden: true })).toBeDisabled()
      release()
      await waitFor(() => expect(onSaved).toHaveBeenCalled())
    })

    it('"Lưu" đổi chữ, "Lưu & xác nhận" giữ chữ', async () => {
      let release: () => void = () => {}
      const gate = new Promise<void>((r) => (release = r))
      server.use(
        mswHttp.patch(`${URL_W}/if-1`, async () => {
          await gate
          return ok({ ...draftForm, version: 4 })
        }),
      )
      const { user, onSaved } = setup({ formSlug: 'if-1', detail: draftForm, canConfirm: true })
      await user.clear(await noteBox(user))
      await user.click(saveButton())
      await confirmDialog(user, 'Lưu thay đổi')
      await waitFor(() => expect(footerButtons()).toEqual(['Huỷ', 'Lưu & xác nhận', 'Đang lưu...']))
      release()
      await waitFor(() => expect(onSaved).toHaveBeenCalled())
    })
  })

  describe('M2: bước ③ khi sửa', () => {
    it('câu mô tả nói "Lưu", không nhắc "Lưu nháp"', async () => {
      const { user } = setup({ formSlug: 'if-1', detail: draftForm, canConfirm: true })
      await editLoaded()
      await user.click(within(stepsNav()).getByRole('button', { name: /Kiểm tra & lưu$/ }))
      await waitFor(() => expect(reviewHeading()).toBeVisible())
      expect(
        screen.getByText(
          'Xem lại trước khi lưu. Lưu chưa cộng tồn kho; Lưu & xác nhận cộng tồn ngay.',
        ),
      ).toBeVisible()
    })
  })

  describe('M4: lỗi cấp danh sách dòng → toast + về ②', () => {
    for (const code of [101311, 101317, 101318]) {
      it(`③ POST trả ${code} → toast và về ②`, async () => {
        const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id')
        server.use(mswHttp.post(URL_W, () => apiError(400, code, 'Items invalid')))
        const { user } = setup()
        await toReview(user)
        await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
        await confirmDialog(user, 'Lưu nháp')
        await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
        await waitFor(() => expect(materialBox()).toBeVisible())
        expect(reviewHeading()).not.toBeInTheDocument()
        errorSpy.mockRestore()
      })
    }
  })

  describe('M5: dải bước khi đang upload', () => {
    it('đang upload ở ① → nút ② và ③ trên dải bị khoá, ① vẫn bấm được; xong thì mở lại', async () => {
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
      const { user } = setup()
      await fillInfo(user)
      await user.upload(screen.getByLabelText('Chứng từ đính kèm'), new File(['x'], 'a.pdf'))
      const nav = within(stepsNav())
      await waitFor(() =>
        expect(nav.getByRole('button', { name: /Chi tiết vật tư$/ })).toBeDisabled(),
      )
      expect(nav.getByRole('button', { name: /Kiểm tra & lưu$/ })).toBeDisabled()
      expect(nav.getByRole('button', { name: /Thông tin phiếu$/ })).toBeEnabled()
      release()
      await waitFor(() =>
        expect(nav.getByRole('button', { name: /Chi tiết vật tư$/ })).toBeEnabled(),
      )
      expect(nav.getByRole('button', { name: /Kiểm tra & lưu$/ })).toBeEnabled()
    })
  })
})

describe('ImportFormSheet - hỏi xác nhận trước khi lưu', () => {
  const confirmBox = () => screen.findByRole('alertdialog')

  /** Đếm mọi request ghi (tạo / sửa / xác nhận), kèm body. */
  function recordWrites() {
    const calls: { kind: string; body: unknown }[] = []
    server.use(
      mswHttp.post(URL_W, async ({ request }) => {
        calls.push({ kind: 'create', body: await request.json() })
        return ok(draftForm)
      }),
      mswHttp.patch(`${URL_W}/if-1`, async ({ request }) => {
        calls.push({ kind: 'patch', body: await request.json() })
        return ok({ ...draftForm, version: 4 })
      }),
      mswHttp.post(`${URL_W}/if-1/confirm`, async ({ request }) => {
        calls.push({ kind: 'confirm', body: await request.json() })
        return ok({ ...draftForm, status: 'CONFIRMED', version: 4 })
      }),
    )
    return calls
  }

  it('tạo ③ "Lưu nháp" → hộp "Tạo phiếu nháp PN-…?", chưa POST; xác nhận → POST', async () => {
    const calls = recordWrites()
    const { user, onSaved } = setup()
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    const dialog = await confirmBox()
    expect(within(dialog).getByRole('heading')).toHaveTextContent(/^Tạo phiếu nháp PN-\S+\?$/)
    expect(dialog).toHaveTextContent('Chưa cộng tồn, sửa được tiếp.')
    // Focus vào trong hộp (mặc định của Radix: nút đầu tiên).
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    expect(calls).toEqual([])
    await confirmDialog(user, 'Lưu nháp')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(calls.map((c) => c.kind)).toEqual(['create'])
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('tạo ③ "Lưu & xác nhận" → hộp tông success; xác nhận → POST rồi xác nhận', async () => {
    const calls = recordWrites()
    const { user, onSaved } = setup({ canConfirm: true })
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    const dialog = await confirmBox()
    expect(within(dialog).getByRole('heading')).toHaveTextContent(/^Lưu và xác nhận PN-\S+\?$/)
    expect(dialog).toHaveTextContent('Tồn kho được cộng ngay, phiếu không sửa được nữa.')
    expect(dialog).not.toHaveTextContent('Đã sửa')
    expect(within(dialog).getByRole('button', { name: 'Lưu & xác nhận' }).className).toContain(
      'bg-success',
    )
    expect(calls).toEqual([])
    await confirmDialog(user, 'Lưu & xác nhận')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(calls.map((c) => c.kind)).toEqual(['create', 'confirm'])
  })

  it('"Quay lại" → hộp đóng, không request, sheet vẫn mở, focus về nút đã mở hộp', async () => {
    const calls = recordWrites()
    const { user, onOpenChange } = setup({ canConfirm: true })
    await toReview(user)
    const trigger = screen.getByRole('button', { name: 'Lưu & xác nhận' })
    await user.click(trigger)
    const dialog = await confirmBox()
    await user.click(within(dialog).getByRole('button', { name: 'Quay lại' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await new Promise((r) => setTimeout(r, 50))
    expect(calls).toEqual([])
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(reviewHeading()).toBeVisible()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('sửa nháp, Enter khi không đổi gì → không có hộp, không có PATCH', async () => {
    const calls = recordWrites()
    const { user } = setup({ formSlug: 'if-1', detail: draftForm })
    await editLoaded()
    await user.click(within(stepsNav()).getByRole('button', { name: /Thông tin phiếu$/ }))
    const invoice = await screen.findByRole('textbox', { name: /^Số hoá đơn/ })
    await user.click(invoice)
    await user.keyboard('{Enter}')
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('sửa nháp: đổi số HĐ, Enter → hộp "Lưu thay đổi phiếu PN-0001?" mở, không PATCH; xác nhận → PATCH', async () => {
    const calls = recordWrites()
    const { user, onSaved } = setup({ formSlug: 'if-1', detail: draftForm })
    await editLoaded()
    await user.click(within(stepsNav()).getByRole('button', { name: /Thông tin phiếu$/ }))
    const invoice = await screen.findByRole('textbox', { name: /^Số hoá đơn/ })
    await user.clear(invoice)
    await user.type(invoice, 'HD-999{Enter}')
    const dialog = await confirmBox()
    expect(within(dialog).getByRole('heading')).toHaveTextContent('Lưu thay đổi phiếu PN-0001?')
    expect(dialog).toHaveTextContent('Đã sửa: Số hoá đơn')
    await new Promise((r) => setTimeout(r, 50))
    expect(calls).toEqual([])
    await confirmDialog(user, 'Lưu thay đổi')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(calls.map((c) => c.kind)).toEqual(['patch'])
    expect(calls[0].body).toMatchObject({ invoiceCode: 'HD-999', version: 3 })
  })

  it('sửa nháp: đổi số lượng dòng → "Đã sửa: Dòng vật tư"', async () => {
    recordWrites()
    const { user } = setup({ formSlug: 'if-1', detail: draftForm })
    await editLoaded()
    const quantity = screen.getByRole('textbox', { name: 'Số lượng dòng 1' })
    await user.clear(quantity)
    await user.type(quantity, '12')
    await user.click(saveButton())
    expect(await confirmBox()).toHaveTextContent('Đã sửa: Dòng vật tư')
  })

  it('hộp đang mở, Esc → chỉ hộp đóng, không hỏi "Bỏ thay đổi chưa lưu?", sheet vẫn mở', async () => {
    const calls = recordWrites()
    const { user, onOpenChange } = setup({ formSlug: 'if-1', detail: draftForm })
    await user.clear(await noteBox(user))
    await user.click(saveButton())
    await confirmBox()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('Bỏ thay đổi chưa lưu?')).not.toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Sửa phiếu nhập PN-0001' })).toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('hộp đang mở, bấm ra ngoài → chỉ hộp đóng, không hỏi "Bỏ thay đổi chưa lưu?", sheet vẫn mở', async () => {
    const calls = recordWrites()
    const { user, onOpenChange } = setup({ formSlug: 'if-1', detail: draftForm })
    await user.clear(await noteBox(user))
    await user.click(saveButton())
    await confirmBox()
    await user.click(document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')!)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('Bỏ thay đổi chưa lưu?')).not.toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Sửa phiếu nhập PN-0001' })).toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('sửa nháp chỉ có bên bán của dòng chưa lưu (form không dirty) → Lưu mở hộp có "Bên bán của dòng"', async () => {
    const calls = recordWrites()
    const legacy: ImportForm = {
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
          quantity: 1,
          conversionRate: 1,
          baseQuantity: 1,
          unitPrice: 1000,
          amount: 1000,
        },
      ],
    }
    const { user } = setup({ formSlug: 'if-1', detail: legacy, canPickSupplier: true })
    await editLoaded()
    await waitFor(() => expect(saveButton()).toBeEnabled())
    await user.click(saveButton())
    const dialog = await confirmBox()
    expect(dialog).toHaveTextContent('Đã sửa: Bên bán của dòng')
    expect(calls).toEqual([])
    await confirmDialog(user, 'Lưu thay đổi')
    await waitFor(() => expect(calls.map((c) => c.kind)).toEqual(['patch']))
  })

  it('sửa: bấm đúp nút xác nhận → chỉ một PATCH', async () => {
    let patches = 0
    server.use(
      mswHttp.patch(`${URL_W}/if-1`, async () => {
        patches += 1
        await new Promise((r) => setTimeout(r, 150))
        return ok({ ...draftForm, version: 4 })
      }),
    )
    const { user, onSaved } = setup({ formSlug: 'if-1', detail: draftForm })
    await user.clear(await noteBox(user))
    await user.click(saveButton())
    const dialog = await confirmBox()
    await user.dblClick(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }))
    // Đang gửi: nút xác nhận đổi chữ và bị khoá.
    expect(within(dialog).getByRole('button', { name: 'Đang lưu...' })).toBeDisabled()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(patches).toBe(1)
  })

  it('đang gửi sau khi xác nhận → Esc không đóng hộp; gửi lỗi tại ô → hộp đóng, lỗi tại ô', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    server.use(
      mswHttp.post(URL_W, async () => {
        await gate
        return apiError(400, 101304, 'code exists')
      }),
    )
    const { user } = setup()
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await confirmDialog(user, 'Lưu nháp')
    const dialog = await confirmBox()
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Đang lưu...' })).toBeDisabled(),
    )
    await user.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    release()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('textbox', { name: /^Mã phiếu/ })).toHaveFocus()
  })
})
