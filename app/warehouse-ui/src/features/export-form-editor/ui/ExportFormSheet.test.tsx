import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExportForm, ExportFormItem } from '@/entities/export-form'
import type { InventoryItem } from '@/entities/inventory'
import type { MaterialBatch } from '@/entities/material-batch'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { confirmDialog } from '@/shared/test/confirm'
import { renderWithProviders } from '@/shared/test/render'
import { ExportFormSheet } from './ExportFormSheet'

const BASE = 'http://localhost:8085/api/v1'
const URL_W = `${BASE}/warehouses/w-a/export-forms`
const URL_STOCK = `${BASE}/warehouses/w-a/materials`
const URL_BATCHES = `${BASE}/warehouses/w-a/material-batches`

const KG = { slug: 'u-kg', code: 'KG', name: 'Kilogram' }
const stockItem = (
  code: string,
  name: string,
  availableQuantity: number,
  extra: Partial<InventoryItem> = {},
): InventoryItem =>
  ({
    slug: `i-${code}`,
    materialSlug: `m-${code}`,
    materialCode: code,
    materialName: name,
    quantity: availableQuantity,
    reservedQuantity: 0,
    availableQuantity,
    baseUnit: KG,
    units: [
      {
        unitSlug: 'u-kg',
        unitCode: 'KG',
        unitName: 'Kilogram',
        conversionRate: 1,
        isBaseUnit: true,
      },
    ],
    ...extra,
  }) as InventoryItem

// Dữ liệu giả — chép từ `@/entities/export-form/model/fixtures` (deep import bị `boundaries/entry-point` chặn).
const item = (overrides: Partial<ExportFormItem> = {}): ExportFormItem => ({
  slug: 'xit-1',
  createdAt: '2026-10-26T02:00:00.000Z',
  updatedAt: '2026-10-26T02:00:00.000Z',
  lineNo: 1,
  materialSlug: 'm-VT-01',
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
const exportForm = (overrides: Partial<ExportForm> = {}): ExportForm => ({
  slug: 'xf-1',
  createdAt: '2026-10-26T02:00:00.000Z',
  updatedAt: '2026-10-26T02:00:00.000Z',
  version: 1,
  code: 'PX-0001',
  type: 'PRODUCTION',
  status: 'DRAFT',
  purchaseOrder: 'PO-12',
  invoiceCode: null,
  requesterSlug: 'u-req',
  requesterName: 'Nguyễn Văn A',
  approverSlug: null,
  approverName: null,
  receiver: 'Xưởng 1',
  totalAmount: 0,
  note: null,
  file: null,
  warehouseSlug: 'w-a',
  items: [item()],
  ...overrides,
})

const created = exportForm()
const submitted = exportForm({ status: 'PENDING', version: 2 })
const confirmed = exportForm({ status: 'CONFIRMED', version: 3 })

type Call = { kind: 'create' | 'patch' | 'submit' | 'confirm'; body: Record<string, unknown> }

type SetupOptions = {
  formSlug?: string
  detail?: ExportForm
  canSubmit?: boolean
  canConfirm?: boolean
  canApproveDisposal?: boolean
  /** Khả dụng của Bột mì (VT-01) — hàm để đổi giữa hai lần tải. */
  flourAvailable?: () => number
  stock?: InventoryItem[]
  /** Lô còn hàng của kho mỗi lần tải — hàm để đổi giữa hai lần tải. */
  batches?: () => MaterialBatch[]
}

function setup({
  formSlug,
  detail,
  canSubmit = true,
  canConfirm = false,
  canApproveDisposal = false,
  flourAvailable = () => 120,
  stock,
  batches = () => [],
}: SetupOptions = {}) {
  server.use(
    mswHttp.get(URL_STOCK, () =>
      paginated(
        stock ?? [stockItem('VT-01', 'Bột mì', flourAvailable()), stockItem('VT-02', 'Đường', 50)],
        {
          size: 500,
        },
      ),
    ),
    mswHttp.get(URL_BATCHES, () => paginated(batches())),
    ...(formSlug && detail ? [mswHttp.get(`${URL_W}/${formSlug}`, () => ok(detail))] : []),
  )
  const onOpenChange = vi.fn()
  const onSaved = vi.fn()
  const ui = (open: boolean) => (
    <ExportFormSheet
      open={open}
      onOpenChange={onOpenChange}
      warehouseSlug="w-a"
      warehouseName="Kho A"
      formSlug={formSlug}
      canSubmit={canSubmit}
      canConfirm={canConfirm}
      canApproveDisposal={canApproveDisposal}
      canReadWarehouses={false}
      canPickBatch
      onSaved={onSaved}
    />
  )
  const r = renderWithProviders(ui(true), { auth: 'admin' })
  return { ...r, onOpenChange, onSaved, reopen: (o: boolean) => r.rerender(ui(o)) }
}

type User = ReturnType<typeof setup>['user']

/** Ghi lại mọi request ghi; `submitError` / `confirmError` = trả lỗi cho lần gọi đó. */
function recordWrites({
  submitErrors = [],
  confirmError,
}: {
  submitErrors?: (() => Response)[]
  confirmError?: () => Response
} = {}) {
  const calls: Call[] = []
  let submitCount = 0
  let version = created.version
  server.use(
    mswHttp.post(URL_W, async ({ request }) => {
      calls.push({ kind: 'create', body: (await request.json()) as Record<string, unknown> })
      return ok(created)
    }),
    mswHttp.patch(`${URL_W}/xf-1`, async ({ request }) => {
      calls.push({ kind: 'patch', body: (await request.json()) as Record<string, unknown> })
      version += 1
      return ok(exportForm({ version }))
    }),
    mswHttp.post(`${URL_W}/xf-1/submit`, async ({ request }) => {
      calls.push({ kind: 'submit', body: (await request.json()) as Record<string, unknown> })
      const fail = submitErrors[submitCount]
      submitCount += 1
      if (fail) return fail()
      return ok({ ...submitted, version: version + 1 })
    }),
    mswHttp.post(`${URL_W}/xf-1/confirm`, async ({ request }) => {
      calls.push({ kind: 'confirm', body: (await request.json()) as Record<string, unknown> })
      return confirmError ? confirmError() : ok(confirmed)
    }),
  )
  return calls
}

const kinds = (calls: Call[]) => calls.map((c) => c.kind)
const shortageError = () => apiError(409, 100817, 'Inventory available insufficient')
const stepsNav = () => screen.getByRole('navigation', { name: 'Các bước lập phiếu' })
const reviewHeading = () => screen.queryByRole('heading', { name: 'Kiểm tra phiếu xuất' })
const qtyBox = (line = 1) => screen.getByRole('textbox', { name: `Số lượng dòng ${line}` })
const footer = () => document.querySelector<HTMLElement>('[data-slot="sheet-footer"]')!
const footerButtons = () =>
  within(footer())
    .getAllByRole('button')
    .map((b) => b.textContent)
const tick = () => new Promise((r) => setTimeout(r, 100))

async function fillInfo(user: User, type = 'Sản xuất') {
  await user.click(await screen.findByRole('radio', { name: type }))
  await user.type(screen.getByRole('textbox', { name: /^Người nhận/ }), 'Xưởng 1')
  await user.type(screen.getByRole('textbox', { name: /^Số PO/ }), 'PO-12')
}
async function next(user: User) {
  await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
}
async function fillLine(user: User, quantity = '5', line = 1) {
  await user.click(await screen.findByRole('combobox', { name: `Vật tư dòng ${line}` }))
  await user.click(await screen.findByRole('option', { name: /VT-01 · Bột mì/ }))
  await user.type(qtyBox(line), quantity)
}
async function toReview(
  user: User,
  opts: { type?: string; quantity?: string; price?: string } = {},
) {
  await fillInfo(user, opts.type)
  await next(user)
  await fillLine(user, opts.quantity)
  if (opts.price !== undefined)
    await user.type(screen.getByRole('textbox', { name: 'Đơn giá dòng 1' }), opts.price)
  await next(user)
  await waitFor(() => expect(reviewHeading()).toBeVisible())
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ExportFormSheet — tạo', () => {
  it('mở ở bước ①, tiêu đề có tên kho, chân sheet Huỷ · Tiếp tục', async () => {
    setup()
    expect(await screen.findByRole('dialog', { name: 'Tạo phiếu xuất · Kho A' })).toBeVisible()
    expect(await screen.findByRole('radio', { name: 'Sản xuất' })).toBeVisible()
    expect(within(stepsNav()).getByRole('button', { name: '① Thông tin phiếu' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(footerButtons()).toEqual(['Huỷ', 'Tiếp tục'])
  })

  it('đủ 3 bước → Lưu nháp gửi đúng body (unitPrice 0, không batchSlug), onSaved draft, không tự toast', async () => {
    const success = vi.spyOn(toast, 'success')
    const calls = recordWrites()
    const { user, onSaved, onOpenChange } = setup()
    await toReview(user)
    expect(footerButtons()).toEqual(['Quay lại', 'Lưu nháp', 'Lưu & gửi duyệt'])
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await confirmDialog(user, 'Lưu nháp')
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ form: created, stage: 'draft' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(kinds(calls)).toEqual(['create'])
    const body = calls[0].body
    expect(body).toMatchObject({
      type: 'PRODUCTION',
      receiver: 'Xưởng 1',
      purchaseOrder: 'PO-12',
      items: [{ materialSlug: 'm-VT-01', unitSlug: 'u-kg', quantity: 5, unitPrice: 0 }],
    })
    expect((body.items as Record<string, unknown>[])[0]).not.toHaveProperty('batchSlug')
    expect(body.code).toMatch(/^PX-\d{8}-\d{4}$/)
    expect(success).not.toHaveBeenCalled()
  })

  it('Lưu & gửi duyệt → POST rồi POST /submit với version của phiếu vừa tạo → onSaved submitted', async () => {
    const calls = recordWrites()
    const { user, onSaved, onOpenChange } = setup()
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu & gửi duyệt' }))
    await confirmDialog(user, 'Lưu & gửi duyệt')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(kinds(calls)).toEqual(['create', 'submit'])
    expect(calls[1].body).toEqual({ version: created.version })
    expect(onSaved.mock.calls[0][0]).toMatchObject({ stage: 'submitted' })
    expect(onSaved.mock.calls[0][0].error).toBeUndefined()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('đang gửi → chỉ nút vừa bấm đổi chữ "Đang lưu...", các nút khác khoá', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    server.use(
      mswHttp.post(URL_W, async () => {
        await gate
        return ok(created)
      }),
    )
    const { user, onSaved } = setup({ canConfirm: true })
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await confirmDialog(user, 'Lưu nháp')
    // Hộp xác nhận mở tới khi gửi xong (khoá, Esc không đóng); chân sheet nằm sau hộp modal (`aria-hidden`).
    const dialog = screen.getByRole('alertdialog')
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Đang lưu...' })).toBeDisabled(),
    )
    await user.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    const inFooter = (name: string) => within(footer()).getByRole('button', { name, hidden: true })
    expect(inFooter('Đang lưu...')).toBeDisabled()
    expect(inFooter('Lưu & gửi duyệt')).toBeDisabled()
    expect(inFooter('Gửi & xác nhận')).toBeDisabled()
    expect(inFooter('Quay lại')).toBeDisabled()
    release()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('không có quyền gửi duyệt → chỉ Lưu nháp ở ③', async () => {
    const { user } = setup({ canSubmit: false, canConfirm: true })
    await toReview(user)
    expect(footerButtons()).toEqual(['Quay lại', 'Lưu nháp'])
  })

  describe('submit lỗi khi tạo — Review Focus 3', () => {
    it('409 / 100817 → sheet mở ở ②, dòng thiếu được đánh dấu sau khi tải lại tồn, ô Số lượng có focus', async () => {
      let available = 120
      const calls = recordWrites({ submitErrors: [shortageError] })
      const { user, onSaved, onOpenChange } = setup({ flourAvailable: () => available })
      await toReview(user)
      available = 2
      await user.click(screen.getByRole('button', { name: 'Lưu & gửi duyệt' }))
      await confirmDialog(user, 'Lưu & gửi duyệt')
      await waitFor(() => expect(onSaved).toHaveBeenCalled())
      expect(onSaved.mock.calls[0][0]).toMatchObject({ form: created, stage: 'draft' })
      expect(onSaved.mock.calls[0][0].error).toMatchObject({ code: 100817 })
      expect(onOpenChange).not.toHaveBeenCalledWith(false)
      expect(await screen.findByText('Chỉ còn 2 KG khả dụng')).toBeVisible()
      await waitFor(() => expect(qtyBox()).toHaveFocus())
      expect(within(stepsNav()).getByRole('button', { name: /Chi tiết vật tư/ })).toHaveAttribute(
        'aria-current',
        'step',
      )
      // Đã thành chế độ sửa phiếu vừa tạo: tiêu đề có mã, chân sheet Huỷ · Lưu & gửi duyệt · Lưu.
      expect(screen.getByRole('dialog', { name: 'Sửa phiếu xuất PX-0001' })).toBeVisible()
      expect(footerButtons()).toEqual(['Huỷ', 'Lưu & gửi duyệt', 'Lưu'])
      expect(screen.getByRole('button', { name: 'Lưu & gửi duyệt' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
      expect(kinds(calls)).toEqual(['create', 'submit'])
    })

    it('sửa số lượng rồi bấm lại "Lưu & gửi duyệt" → PATCH (version phiếu đã tạo) + submit, KHÔNG POST tạo thứ hai', async () => {
      let available = 120
      const calls = recordWrites({ submitErrors: [shortageError] })
      const { user, onSaved, onOpenChange } = setup({ flourAvailable: () => available })
      await toReview(user)
      available = 2
      await user.click(screen.getByRole('button', { name: 'Lưu & gửi duyệt' }))
      await confirmDialog(user, 'Lưu & gửi duyệt')
      await screen.findByText('Chỉ còn 2 KG khả dụng')
      await user.clear(qtyBox())
      await user.type(qtyBox(), '2')
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Lưu & gửi duyệt' })).toBeEnabled(),
      )
      await user.click(screen.getByRole('button', { name: 'Lưu & gửi duyệt' }))
      await confirmDialog(user, 'Lưu & gửi duyệt')
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2))
      expect(kinds(calls)).toEqual(['create', 'submit', 'patch', 'submit'])
      expect(calls[2].body).toMatchObject({ version: 1, items: [{ quantity: 2 }] })
      expect(calls[3].body).toEqual({ version: 2 })
      expect(onSaved.mock.calls[1][0]).toMatchObject({ stage: 'submitted' })
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('tải lại mà không ra dòng nào thiếu → chỉ báo; bấm lại → chỉ submit (không PATCH, không POST)', async () => {
      const calls = recordWrites({ submitErrors: [shortageError] })
      const { user, onSaved } = setup()
      await toReview(user)
      await user.click(screen.getByRole('button', { name: 'Lưu & gửi duyệt' }))
      await confirmDialog(user, 'Lưu & gửi duyệt')
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
      await waitFor(() =>
        expect(within(stepsNav()).getByRole('button', { name: /Chi tiết vật tư/ })).toHaveAttribute(
          'aria-current',
          'step',
        ),
      )
      expect(screen.queryByText(/^Chỉ còn/)).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Lưu & gửi duyệt' }))
      await confirmDialog(user, 'Lưu & gửi duyệt')
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2))
      expect(kinds(calls)).toEqual(['create', 'submit', 'submit'])
      expect(calls[2].body).toEqual({ version: 1 })
    })
  })

  it('Gửi & xác nhận thành công → create, submit, confirm → onSaved confirmed', async () => {
    const calls = recordWrites()
    const { user, onSaved, onOpenChange } = setup({ canConfirm: true })
    await toReview(user)
    expect(footerButtons()).toEqual(['Quay lại', 'Lưu nháp', 'Lưu & gửi duyệt', 'Gửi & xác nhận'])
    await user.click(screen.getByRole('button', { name: 'Gửi & xác nhận' }))
    await confirmDialog(user, 'Gửi & xác nhận')
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({ form: confirmed, stage: 'confirmed' }),
    )
    expect(kinds(calls)).toEqual(['create', 'submit', 'confirm'])
    expect(calls[2].body).toEqual({ version: 2 })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('Gửi & xác nhận, confirm lỗi → onSaved({ stage: submitted, error }), sheet đóng', async () => {
    const calls = recordWrites({ confirmError: () => apiError(500, 100500, 'Internal error') })
    const { user, onSaved, onOpenChange } = setup({ canConfirm: true })
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Gửi & xác nhận' }))
    await confirmDialog(user, 'Gửi & xác nhận')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onSaved.mock.calls[0][0]).toMatchObject({
      form: { status: 'PENDING', version: 2 },
      stage: 'submitted',
    })
    expect(onSaved.mock.calls[0][0].error).toBeDefined()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(kinds(calls)).toEqual(['create', 'submit', 'confirm'])
  })

  it('Gửi & xác nhận 409 thiếu hàng → sheet sửa vẫn có "Gửi & xác nhận"; sửa số lượng rồi bấm → PATCH + submit + confirm, không POST lần hai', async () => {
    let available = 120
    const calls = recordWrites({ submitErrors: [shortageError] })
    const { user, onSaved, onOpenChange } = setup({
      canConfirm: true,
      flourAvailable: () => available,
    })
    await toReview(user)
    available = 2
    await user.click(screen.getByRole('button', { name: 'Gửi & xác nhận' }))
    await confirmDialog(user, 'Gửi & xác nhận')
    await screen.findByText('Chỉ còn 2 KG khả dụng')
    expect(footerButtons()).toEqual(['Huỷ', 'Lưu & gửi duyệt', 'Gửi & xác nhận', 'Lưu'])
    expect(screen.getByRole('button', { name: 'Gửi & xác nhận' })).toBeDisabled()
    await user.clear(qtyBox())
    await user.type(qtyBox(), '2')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Gửi & xác nhận' })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: 'Gửi & xác nhận' }))
    await confirmDialog(user, 'Gửi & xác nhận')
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2))
    expect(kinds(calls)).toEqual(['create', 'submit', 'patch', 'submit', 'confirm'])
    expect(onSaved.mock.calls[1][0]).toMatchObject({ stage: 'confirmed' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('Xuất huỷ mà không có quyền duyệt huỷ → không có "Gửi & xác nhận"', async () => {
    const { user } = setup({ canConfirm: true })
    await toReview(user, { type: 'Xuất huỷ' })
    expect(footerButtons()).toEqual(['Quay lại', 'Lưu nháp', 'Lưu & gửi duyệt'])
  })

  it('dòng vượt khả dụng → hai nút gửi khoá kèm lý do; ③ liệt kê dòng vượt; Lưu nháp vẫn được', async () => {
    const calls = recordWrites()
    const { user, onSaved } = setup({ canConfirm: true })
    await toReview(user, { quantity: '500' })
    const reason = screen.getByText(/vượt số khả dụng/)
    for (const name of ['Lưu & gửi duyệt', 'Gửi & xác nhận']) {
      const button = screen.getByRole('button', { name })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('aria-describedby', reason.id)
      // Nút gửi đang khoá vì thiếu hàng không mở hộp hỏi.
      fireEvent.click(button)
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    }
    expect(screen.getByText(/Cần xem lại \(1\)/)).toBeVisible()
    expect(screen.getByText(/Dòng 1 · Bột mì — chỉ còn 120 KG khả dụng/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await confirmDialog(user, 'Lưu nháp')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(kinds(calls)).toEqual(['create'])
  })

  it('③ "sửa" ở dòng vượt khả dụng → về ②, ô Số lượng dòng đó có focus', async () => {
    const { user } = setup()
    await toReview(user, { quantity: '500' })
    await user.click(screen.getByRole('button', { name: 'sửa' }))
    await waitFor(() => expect(qtyBox()).toHaveFocus())
  })

  it('③ bảng dòng ghi lô "Tự chọn — hết hạn sớm nhất trước"', async () => {
    const { user } = setup()
    await toReview(user)
    expect(screen.getAllByText('Tự chọn — hết hạn sớm nhất trước').length).toBeGreaterThan(0)
  })

  describe('đổi lý do Bán → khác khi đã có giá', () => {
    async function saleLine(user: User) {
      await fillInfo(user, 'Bán')
      await next(user)
      await fillLine(user)
      await user.type(screen.getByRole('textbox', { name: 'Đơn giá dòng 1' }), '1000')
      await user.click(within(stepsNav()).getByRole('button', { name: /Thông tin phiếu$/ }))
      await user.click(await screen.findByRole('radio', { name: 'Sản xuất' }))
    }

    it('hỏi "Bỏ đơn giá của 1 dòng?"; huỷ → vẫn Bán, giá còn nguyên', async () => {
      const { user } = setup()
      await saleLine(user)
      const dialog = await screen.findByRole('alertdialog', { name: 'Bỏ đơn giá của 1 dòng?' })
      await user.click(within(dialog).getByRole('button', { name: 'Giữ lý do Bán' }))
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      expect(screen.getByRole('radio', { name: 'Bán' })).toHaveAttribute('aria-checked', 'true')
      await user.click(within(stepsNav()).getByRole('button', { name: /Chi tiết vật tư/ }))
      expect(await screen.findByRole('textbox', { name: 'Đơn giá dòng 1' })).toHaveValue('1.000')
    })

    it('đồng ý → Sản xuất, cột giá ẩn; quay lại Bán thì ô giá trống', async () => {
      const { user } = setup()
      await saleLine(user)
      const dialog = await screen.findByRole('alertdialog', { name: 'Bỏ đơn giá của 1 dòng?' })
      await user.click(within(dialog).getByRole('button', { name: 'Bỏ đơn giá' }))
      await waitFor(() =>
        expect(screen.getByRole('radio', { name: 'Sản xuất' })).toHaveAttribute(
          'aria-checked',
          'true',
        ),
      )
      expect(screen.queryByRole('textbox', { name: 'Đơn giá dòng 1' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('radio', { name: 'Bán' }))
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      await user.click(within(stepsNav()).getByRole('button', { name: /Chi tiết vật tư/ }))
      expect(await screen.findByRole('textbox', { name: 'Đơn giá dòng 1' })).toHaveValue('')
    })
  })

  it('Bán: ③ có Tổng tiền, chân sheet có Tổng; body gửi đơn giá', async () => {
    const calls = recordWrites()
    const { user, onSaved } = setup()
    await toReview(user, { type: 'Bán', price: '1000' })
    expect(within(footer()).getByText(/Tổng: 5\.000/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await confirmDialog(user, 'Lưu nháp')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(calls[0].body).toMatchObject({ type: 'SALE', items: [{ quantity: 5, unitPrice: 1000 }] })
  })

  it('bấm đúp "Tiếp tục" ở ② (cú thứ hai rơi vào nút ở ③) → không lưu', async () => {
    const calls = recordWrites()
    const { user, onSaved } = setup({ canConfirm: true })
    await fillInfo(user)
    await next(user)
    await fillLine(user)
    await next(user)
    await waitFor(() => expect(reviewHeading()).toBeVisible())
    for (const name of ['Lưu nháp', 'Lưu & gửi duyệt', 'Gửi & xác nhận'])
      fireEvent.click(screen.getByRole('button', { name }), { detail: 2 })
    await tick()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(calls).toEqual([])
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('Enter ở ③ không lưu; Enter ở ① = Tiếp tục', async () => {
    const calls = recordWrites()
    const { user } = setup()
    await fillInfo(user)
    await user.type(screen.getByRole('textbox', { name: /^Số PO/ }), '{Enter}')
    expect(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' })).toBeVisible()
    await fillLine(user)
    await next(user)
    await waitFor(() => expect(reviewHeading()).toBeVisible())
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
    await tick()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(calls).toEqual([])
    expect(reviewHeading()).toBeVisible()
  })

  it('Tiếp tục ở ① khi trống → ở lại ①, lỗi Lý do xuất', async () => {
    const { user } = setup()
    await screen.findByRole('radio', { name: 'Sản xuất' })
    await next(user)
    expect(await screen.findByText('Chọn lý do xuất')).toBeVisible()
    expect(screen.queryByRole('combobox', { name: 'Vật tư dòng 1' })).not.toBeInTheDocument()
  })

  it('POST trả 101404 (trùng mã) → về ①, ô Mã phiếu báo lỗi và có focus', async () => {
    server.use(mswHttp.post(URL_W, () => apiError(400, 101404, 'Export form code does exist')))
    const { user, onSaved } = setup()
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await confirmDialog(user, 'Lưu nháp')
    await waitFor(() => expect(screen.getByRole('textbox', { name: /^Mã phiếu/ })).toHaveFocus())
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('POST trả lỗi theo dòng (101429) → toast lỗi, về ②', async () => {
    const error = vi.spyOn(toast, 'error')
    server.use(mswHttp.post(URL_W, () => apiError(400, 101429, 'not in warehouse')))
    const { user } = setup()
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await confirmDialog(user, 'Lưu nháp')
    await waitFor(() => expect(error).toHaveBeenCalled())
    await waitFor(() => expect(reviewHeading()).not.toBeInTheDocument())
    expect(qtyBox()).toBeVisible()
  })

  it('đóng rồi mở lại → về ①, form trống', async () => {
    const { user, reopen } = setup()
    await toReview(user)
    reopen(false)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    reopen(true)
    expect(await screen.findByRole('textbox', { name: /^Người nhận/ })).toHaveValue('')
    expect(reviewHeading()).not.toBeInTheDocument()
  })
})

describe('ExportFormSheet — sửa nháp', () => {
  const draft = exportForm({ version: 4, items: [item({ quantity: 10 })] })

  it('mở thẳng ②; chưa đổi thì Lưu khoá; chân sheet Huỷ · Lưu & gửi duyệt · Lưu', async () => {
    setup({ formSlug: 'xf-1', detail: draft })
    expect(await screen.findByRole('dialog', { name: 'Sửa phiếu xuất PX-0001' })).toBeVisible()
    await waitFor(() => expect(qtyBox()).toHaveValue('10'))
    expect(within(stepsNav()).getByRole('button', { name: /Chi tiết vật tư/ })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(footerButtons()).toEqual(['Huỷ', 'Lưu & gửi duyệt', 'Lưu'])
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })

  it('có CONFIRM → sửa nháp có "Gửi & xác nhận" (chưa đổi → chỉ submit + confirm); thiếu CONFIRM → không có', async () => {
    const calls = recordWrites()
    const first = setup({ formSlug: 'xf-1', detail: draft, canConfirm: true })
    await waitFor(() => expect(qtyBox()).toHaveValue('10'))
    expect(footerButtons()).toEqual(['Huỷ', 'Lưu & gửi duyệt', 'Gửi & xác nhận', 'Lưu'])
    await first.user.click(screen.getByRole('button', { name: 'Gửi & xác nhận' }))
    await confirmDialog(first.user, 'Gửi & xác nhận')
    await waitFor(() => expect(first.onSaved).toHaveBeenCalled())
    expect(kinds(calls)).toEqual(['submit', 'confirm'])
    expect(first.onSaved.mock.calls[0][0]).toMatchObject({ stage: 'confirmed' })
    first.unmount()
    setup({ formSlug: 'xf-1', detail: draft, canConfirm: false })
    await waitFor(() => expect(qtyBox()).toHaveValue('10'))
    expect(footerButtons()).toEqual(['Huỷ', 'Lưu & gửi duyệt', 'Lưu'])
  })

  it('đổi số lượng → Lưu → PATCH kèm version, onSaved draft', async () => {
    const calls = recordWrites()
    const { user, onSaved } = setup({ formSlug: 'xf-1', detail: draft })
    await waitFor(() => expect(qtyBox()).toHaveValue('10'))
    await user.clear(qtyBox())
    await user.type(qtyBox(), '3')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await confirmDialog(user, 'Lưu thay đổi')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(kinds(calls)).toEqual(['patch'])
    expect(calls[0].body).toMatchObject({ version: 4, items: [{ quantity: 3, unitPrice: 0 }] })
    expect(onSaved.mock.calls[0][0]).toMatchObject({ stage: 'draft' })
  })

  it('chưa đổi + "Lưu & gửi duyệt" → chỉ submit với version cũ', async () => {
    const calls = recordWrites()
    const { user, onSaved } = setup({ formSlug: 'xf-1', detail: draft })
    await waitFor(() => expect(qtyBox()).toHaveValue('10'))
    await user.click(screen.getByRole('button', { name: 'Lưu & gửi duyệt' }))
    await confirmDialog(user, 'Lưu & gửi duyệt')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(kinds(calls)).toEqual(['submit'])
    expect(calls[0].body).toEqual({ version: 4 })
  })

  it('PATCH trả 409 → đóng sheet + toast conflict, không onSaved', async () => {
    const error = vi.spyOn(toast, 'error')
    server.use(mswHttp.patch(`${URL_W}/xf-1`, () => apiError(409, 100800, 'Version conflict')))
    const { user, onSaved, onOpenChange } = setup({ formSlug: 'xf-1', detail: draft })
    await waitFor(() => expect(qtyBox()).toHaveValue('10'))
    await user.clear(qtyBox())
    await user.type(qtyBox(), '3')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await confirmDialog(user, 'Lưu thay đổi')
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(error).toHaveBeenCalledWith(
      'Phiếu vừa bị người khác thay đổi — đã tải lại bản mới nhất.',
    )
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('chưa đổi + submit lỗi khác → toast lỗi, sheet vẫn mở, không báo "đã lưu"', async () => {
    const error = vi.spyOn(toast, 'error')
    recordWrites({ submitErrors: [() => apiError(500, 100500, 'Internal error')] })
    const { user, onSaved, onOpenChange } = setup({ formSlug: 'xf-1', detail: draft })
    await waitFor(() => expect(qtyBox()).toHaveValue('10'))
    await user.click(screen.getByRole('button', { name: 'Lưu & gửi duyệt' }))
    await confirmDialog(user, 'Lưu & gửi duyệt')
    await waitFor(() => expect(error).toHaveBeenCalled())
    expect(onSaved).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('vật tư của dòng không có trong 500 vật tư đã tải (Ruling 7) → vẫn hiện mã · tên + đơn vị, sửa được số lượng', async () => {
    const calls = recordWrites()
    const lost = exportForm({
      version: 4,
      items: [
        item({
          materialSlug: 'm-far',
          materialCode: 'VT-999',
          materialName: 'Vật tư xa',
          unitSlug: 'u-box',
          unitCode: 'HOP',
          unitName: 'Hộp',
          quantity: 7,
        }),
      ],
    })
    const { user, onSaved } = setup({ formSlug: 'xf-1', detail: lost })
    expect(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' })).toHaveTextContent(
      'VT-999 · Vật tư xa',
    )
    expect(screen.getByRole('combobox', { name: 'Đơn vị dòng 1' })).toHaveTextContent('HOP')
    await user.clear(qtyBox())
    await user.type(qtyBox(), '8')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await confirmDialog(user, 'Lưu thay đổi')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(calls[0].body).toMatchObject({
      items: [{ materialSlug: 'm-far', unitSlug: 'u-box', quantity: 8 }],
    })
  })
})

describe('ExportFormSheet — lô chọn tay đã hết (fix round 1)', () => {
  const pickedBatch: MaterialBatch = {
    slug: 'b-1',
    entryDate: '2026-09-01',
    expiryDate: '2026-12-31',
    quantity: 50,
    remainingQuantity: 50,
    reservedQuantity: 0,
    availableQuantity: 50,
    status: 1,
    materialSlug: 'm-VT-01',
    materialCode: 'VT-01',
    materialName: 'Bột mì',
    importFormSlug: 'if-1',
    importFormCode: 'PN-001',
    warehouseSlug: 'w-a',
  }
  const batchError = () => apiError(409, 101502, 'Material batch insufficient')

  /** Tạo: ① → ② chọn Bột mì + lô b-1, số lượng 5. */
  async function lineWithBatch(user: User) {
    await fillInfo(user)
    await next(user)
    await fillLine(user)
    await user.click(screen.getByRole('combobox', { name: /^Lô dòng 1/ }))
    await user.click(await screen.findByRole('option', { name: /PN-001/ }))
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /^Lô dòng 1/ })).toHaveTextContent('HSD'),
    )
  }

  it('submit trả 409 / 101502, lô không còn trong danh sách tải lại → dòng báo còn 0, focus Số lượng, nút gửi khoá kèm lý do', async () => {
    let list = [pickedBatch]
    const calls = recordWrites({ submitErrors: [batchError] })
    const { user, onSaved } = setup({ batches: () => list })
    await lineWithBatch(user)
    await next(user)
    await waitFor(() => expect(reviewHeading()).toBeVisible())
    list = []
    await user.click(screen.getByRole('button', { name: 'Lưu & gửi duyệt' }))
    await confirmDialog(user, 'Lưu & gửi duyệt')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(await screen.findByText('Chỉ còn 0 KG khả dụng')).toBeVisible()
    await waitFor(() => expect(qtyBox()).toHaveFocus())
    const reason = screen.getByText(/vượt số khả dụng/)
    const send = screen.getByRole('button', { name: 'Lưu & gửi duyệt' })
    expect(send).toBeDisabled()
    expect(send).toHaveAttribute('aria-describedby', reason.id)
    expect(kinds(calls)).toEqual(['create', 'submit'])
  })

  it('danh sách lô tải lại không còn lô đã chọn → ③ báo dòng vượt, cả hai nút gửi khoá kèm lý do', async () => {
    let list = [pickedBatch]
    const { user } = setup({ canConfirm: true, batches: () => list })
    await lineWithBatch(user)
    // Lô vừa bị người khác giữ hết: mở lại ô lô làm danh sách tải lại (không còn b-1).
    list = []
    await user.click(screen.getByRole('combobox', { name: /^Lô dòng 1/ }))
    await screen.findByText('Vật tư này chưa có lô còn hàng')
    await user.keyboard('{Escape}')
    expect(await screen.findByText('Chỉ còn 0 KG khả dụng')).toBeVisible()
    await next(user)
    await waitFor(() => expect(reviewHeading()).toBeVisible())
    expect(screen.getByText(/Dòng 1 · Bột mì — chỉ còn 0 KG khả dụng/)).toBeVisible()
    const reason = screen.getByText(/vượt số khả dụng/)
    for (const name of ['Lưu & gửi duyệt', 'Gửi & xác nhận']) {
      const button = screen.getByRole('button', { name })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('aria-describedby', reason.id)
    }
  })
})

describe('ExportFormSheet — hỏi xác nhận trước khi lưu', () => {
  const draft = exportForm({ version: 4, items: [item({ quantity: 10 })] })
  const confirmBox = () => screen.findByRole('alertdialog')
  const editLoaded = () => waitFor(() => expect(qtyBox()).toHaveValue('10'))
  async function changeQuantity(user: User, value = '3') {
    await user.clear(qtyBox())
    await user.type(qtyBox(), value)
  }

  it('tạo ③ "Lưu nháp" → hộp "Tạo phiếu nháp PX-…?", chưa POST; xác nhận → POST', async () => {
    const calls = recordWrites()
    const { user, onSaved } = setup()
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    const dialog = await confirmBox()
    expect(within(dialog).getByRole('heading')).toHaveTextContent(/^Tạo phiếu nháp PX-\S+\?$/)
    expect(dialog).toHaveTextContent('Phiếu chưa giữ chỗ hàng, sửa được tiếp.')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    await tick()
    expect(calls).toEqual([])
    await confirmDialog(user, 'Lưu nháp')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(kinds(calls)).toEqual(['create'])
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('tạo ③ "Lưu & gửi duyệt" → hộp "Lưu và gửi duyệt PX-…?" chỉ có câu hậu quả; xác nhận → POST + submit', async () => {
    const calls = recordWrites()
    const { user, onSaved } = setup()
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Lưu & gửi duyệt' }))
    const dialog = await confirmBox()
    expect(within(dialog).getByRole('heading')).toHaveTextContent(/^Lưu và gửi duyệt PX-\S+\?$/)
    expect(dialog).toHaveTextContent('Hàng sẽ được giữ chỗ, phiếu không sửa được nữa.')
    expect(dialog).not.toHaveTextContent('Đã sửa')
    await tick()
    expect(calls).toEqual([])
    await confirmDialog(user, 'Lưu & gửi duyệt')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(kinds(calls)).toEqual(['create', 'submit'])
  })

  it('tạo ③ "Gửi & xác nhận" → hộp "Xuất kho PX-…?" tông success; xác nhận → POST + submit + confirm', async () => {
    const calls = recordWrites()
    const { user, onSaved } = setup({ canConfirm: true })
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Gửi & xác nhận' }))
    const dialog = await confirmBox()
    expect(within(dialog).getByRole('heading')).toHaveTextContent(/^Xuất kho PX-\S+\?$/)
    expect(dialog).toHaveTextContent('Tồn kho bị trừ ngay, không hoàn tác được.')
    expect(within(dialog).getByRole('button', { name: 'Gửi & xác nhận' }).className).toContain(
      'bg-success',
    )
    await tick()
    expect(calls).toEqual([])
    await confirmDialog(user, 'Gửi & xác nhận')
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({ form: confirmed, stage: 'confirmed' }),
    )
    expect(kinds(calls)).toEqual(['create', 'submit', 'confirm'])
  })

  it('"Quay lại" → hộp đóng, không request, vẫn ở ③, focus về nút đã mở hộp', async () => {
    const calls = recordWrites()
    const { user, onOpenChange } = setup({ canConfirm: true })
    await toReview(user)
    const trigger = screen.getByRole('button', { name: 'Gửi & xác nhận' })
    await user.click(trigger)
    const dialog = await confirmBox()
    await user.click(within(dialog).getByRole('button', { name: 'Quay lại' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await tick()
    expect(calls).toEqual([])
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(reviewHeading()).toBeVisible()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('sửa nháp, Enter khi không đổi gì → không có hộp, không có PATCH', async () => {
    const calls = recordWrites()
    const { user } = setup({ formSlug: 'xf-1', detail: draft })
    await editLoaded()
    await user.click(within(stepsNav()).getByRole('button', { name: /Thông tin phiếu$/ }))
    const po = await screen.findByRole('textbox', { name: /^Số PO/ })
    await user.click(po)
    await user.keyboard('{Enter}')
    await tick()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('sửa nháp: đổi Số PO, Enter → hộp "Lưu thay đổi phiếu PX-0001?", không PATCH; xác nhận → PATCH', async () => {
    const calls = recordWrites()
    const { user, onSaved } = setup({ formSlug: 'xf-1', detail: draft })
    await editLoaded()
    await user.click(within(stepsNav()).getByRole('button', { name: /Thông tin phiếu$/ }))
    const po = await screen.findByRole('textbox', { name: /^Số PO/ })
    await user.clear(po)
    await user.type(po, 'PO-99{Enter}')
    const dialog = await confirmBox()
    expect(within(dialog).getByRole('heading')).toHaveTextContent('Lưu thay đổi phiếu PX-0001?')
    expect(dialog).toHaveTextContent('Đã sửa: Số PO')
    await tick()
    expect(calls).toEqual([])
    await confirmDialog(user, 'Lưu thay đổi')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(kinds(calls)).toEqual(['patch'])
    expect(calls[0].body).toMatchObject({ purchaseOrder: 'PO-99', version: 4 })
  })

  it('sửa nháp: đổi số lượng dòng → Lưu → "Đã sửa: Dòng vật tư"', async () => {
    recordWrites()
    const { user } = setup({ formSlug: 'xf-1', detail: draft })
    await editLoaded()
    await changeQuantity(user)
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(await confirmBox()).toHaveTextContent('Đã sửa: Dòng vật tư')
  })

  it('sửa nháp chưa đổi + "Gửi & xác nhận" → hộp "Xuất kho PX-0001?" chỉ có câu hậu quả; xác nhận → submit + confirm', async () => {
    const calls = recordWrites()
    const { user, onSaved } = setup({ formSlug: 'xf-1', detail: draft, canConfirm: true })
    await editLoaded()
    await user.click(screen.getByRole('button', { name: 'Gửi & xác nhận' }))
    const dialog = await confirmBox()
    expect(within(dialog).getByRole('heading')).toHaveTextContent('Xuất kho PX-0001?')
    expect(within(dialog).getByText('Tồn kho bị trừ ngay, không hoàn tác được.')).toBeVisible()
    expect(dialog).not.toHaveTextContent('Đã sửa')
    await tick()
    expect(calls).toEqual([])
    await confirmDialog(user, 'Gửi & xác nhận')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(kinds(calls)).toEqual(['submit', 'confirm'])
  })

  it('sửa nháp có đổi + "Lưu & gửi duyệt" → hậu quả + "Đã sửa: Dòng vật tư"; xác nhận → PATCH + submit', async () => {
    const calls = recordWrites()
    const { user, onSaved } = setup({ formSlug: 'xf-1', detail: draft })
    await editLoaded()
    await changeQuantity(user)
    await user.click(screen.getByRole('button', { name: 'Lưu & gửi duyệt' }))
    const dialog = await confirmBox()
    expect(within(dialog).getByRole('heading')).toHaveTextContent('Lưu và gửi duyệt PX-0001?')
    expect(
      within(dialog).getByText(
        'Hàng sẽ được giữ chỗ, phiếu không sửa được nữa. Đã sửa: Dòng vật tư',
      ),
    ).toBeVisible()
    await tick()
    expect(calls).toEqual([])
    await confirmDialog(user, 'Lưu & gửi duyệt')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(kinds(calls)).toEqual(['patch', 'submit'])
  })

  it('sửa: phiếu không hợp lệ → không mở hộp, ô lỗi có focus', async () => {
    const calls = recordWrites()
    const { user } = setup({ formSlug: 'xf-1', detail: draft })
    await editLoaded()
    await user.clear(qtyBox())
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(qtyBox()).toHaveFocus())
    await tick()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('hộp đang mở, Esc → chỉ hộp đóng, không hỏi "Bỏ thay đổi chưa lưu?", sheet vẫn mở', async () => {
    const calls = recordWrites()
    const { user, onOpenChange } = setup({ formSlug: 'xf-1', detail: draft })
    await editLoaded()
    await changeQuantity(user)
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await confirmBox()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await tick()
    expect(screen.queryByText('Bỏ thay đổi chưa lưu?')).not.toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Sửa phiếu xuất PX-0001' })).toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('sửa: bấm đúp nút xác nhận → chỉ một PATCH', async () => {
    let patches = 0
    server.use(
      mswHttp.patch(`${URL_W}/xf-1`, async () => {
        patches += 1
        await new Promise((r) => setTimeout(r, 150))
        return ok(exportForm({ version: 5 }))
      }),
    )
    const { user, onSaved } = setup({ formSlug: 'xf-1', detail: draft })
    await editLoaded()
    await changeQuantity(user)
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    const dialog = await confirmBox()
    await user.dblClick(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }))
    // Đang gửi: nút xác nhận đổi chữ và bị khoá.
    expect(within(dialog).getByRole('button', { name: 'Đang lưu...' })).toBeDisabled()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(patches).toBe(1)
  })

  it('đang gửi sau khi xác nhận → Esc không đóng hộp; lỗi trùng mã → hộp đóng, ô Mã phiếu có focus', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    server.use(
      mswHttp.post(URL_W, async () => {
        await gate
        return apiError(400, 101404, 'Export form code does exist')
      }),
    )
    const { user, onSaved } = setup()
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
    expect(onSaved).not.toHaveBeenCalled()
  })
})
