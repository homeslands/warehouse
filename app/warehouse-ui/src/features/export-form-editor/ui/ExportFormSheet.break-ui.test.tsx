/**
 * `break-ui`: dựng sheet phiếu xuất với dữ liệu demo và worst-case. Chạy thường thì chỉ kiểm vài bất biến dựng được ở
 * jsdom (không đo layout); đặt `BREAK_UI_OUT=<thư mục>` thì ghi HTML từng trạng thái ra đó để dựng trang so sánh có
 * toggle (CSS build thật + Chrome headless) — chỉ dùng khi dev, không phải một phần của app.
 */
import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { ExportForm, ExportFormItem } from '@/entities/export-form'
import type { InventoryItem } from '@/entities/inventory'
import type { MaterialBatch } from '@/entities/material-batch'
import type { Warehouse } from '@/entities/warehouse'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { ExportFormSheet } from './ExportFormSheet'

const BASE = 'http://localhost:8085/api/v1'
const URL_W = `${BASE}/warehouses/w-a/export-forms`

/** Chỉ chạy dưới Node (Vitest) khi có `BREAK_UI_OUT`; tsconfig của app không có type Node nên nạp `fs` động. */
const OUT = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  .BREAK_UI_OUT
const FS_MODULE = 'node:fs'

async function dump(name: string) {
  if (!OUT) return
  const fs = (await import(/* @vite-ignore */ FS_MODULE)) as {
    mkdirSync: (p: string, o: { recursive: boolean }) => void
    writeFileSync: (p: string, data: string) => void
  }
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(`${OUT}/${name}.html`, document.body.innerHTML)
}

const LONG_NAME = 'Thep'.repeat(30) // 120 ký tự, không khoảng trắng
const LONG_CODE = 'MAT-THEP-CUON-CB300V-D10-XXXXXXXX'
const LONG_RECEIVER =
  'Kho: KHO-MIEN-NAM-01 · Kho tổng miền Nam — Khu công nghiệp Tân Tạo, quận Bình Tân, Thành phố Hồ Chí Minh, cổng số 3'
const HUGE = 99_999_999.123456
const KG = { slug: 'u-kg', code: 'KG', name: 'Kilogram' }

const stockItem = (slug: string, code: string, name: string, available: number): InventoryItem =>
  ({
    slug: `i-${slug}`,
    materialSlug: slug,
    materialCode: code,
    materialName: name,
    quantity: available,
    reservedQuantity: 0,
    availableQuantity: available,
    baseUnit: KG,
    units: [
      {
        unitSlug: 'u-kg',
        unitCode: 'KG',
        unitName: 'Kilogram',
        conversionRate: 1,
        isBaseUnit: true,
      },
      {
        unitSlug: 'u-coil',
        unitCode: 'CUON-2T-TC',
        unitName: 'Cuộn 2 tấn tiêu chuẩn nhà máy',
        conversionRate: 2000,
        isBaseUnit: false,
      },
    ],
  }) as InventoryItem

const DEMO_STOCK = [
  stockItem('m-flour', 'VT-01', 'Bột mì', 120),
  stockItem('m-salt', 'VT-03', 'Muối', 40),
]
const WORST_STOCK = [
  stockItem('m-long', LONG_CODE, LONG_NAME, HUGE),
  stockItem('m-a', 'A', 'B', 1),
  stockItem('m-zero', 'VT-0', 'Hết hàng hoàn toàn', 0),
]

const batch = (
  slug: string,
  materialSlug: string,
  extra: Partial<MaterialBatch> = {},
): MaterialBatch => ({
  slug,
  entryDate: '2026-01-01',
  expiryDate: null,
  quantity: HUGE,
  remainingQuantity: HUGE,
  reservedQuantity: 0,
  availableQuantity: HUGE,
  status: 1,
  materialSlug,
  materialCode: LONG_CODE,
  materialName: LONG_NAME,
  importFormSlug: 'if-1',
  importFormCode: 'PN-2026-000000000001',
  warehouseSlug: 'w-a',
  ...extra,
})
const BATCHES = [batch('b-none', 'm-long'), batch('b-old', 'm-long', { expiryDate: '2020-01-01' })]

const line = (overrides: Partial<ExportFormItem>): ExportFormItem => ({
  slug: 'xit',
  createdAt: '',
  updatedAt: '',
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
  unitPrice: 25_000,
  amount: 250_000,
  note: null,
  ...overrides,
})
const draft = (overrides: Partial<ExportForm>): ExportForm => ({
  slug: 'xf-1',
  createdAt: '',
  updatedAt: '',
  version: 1,
  code: 'PX-20261026-0830',
  type: 'SALE',
  status: 'DRAFT',
  purchaseOrder: 'PO-12',
  invoiceCode: null,
  requesterSlug: 'u-1',
  requesterName: 'Nguyễn Văn A',
  approverSlug: null,
  approverName: null,
  receiver: 'Cửa hàng B',
  totalAmount: 250_000,
  note: null,
  file: null,
  warehouseSlug: 'w-a',
  items: [line({})],
  ...overrides,
})

/** Kho đích (Chuyển kho): mã 32 ký tự + tên dài, một kho tên một chữ; kho hiện tại bị loại khỏi danh sách. */
const TARGET_WAREHOUSES = [
  { slug: 'w-a', code: 'KHO-A', name: 'Kho đang lập phiếu', isActive: true },
  {
    slug: 'w-long',
    code: 'KHO-MIEN-NAM-01-ABCDEFGHIJKLMNOP',
    name: 'Kho tổng miền Nam — Khu công nghiệp Tân Tạo, quận Bình Tân, Thành phố Hồ Chí Minh, cổng số 3',
    isActive: true,
  },
  { slug: 'w-b', code: 'B', name: 'C', isActive: true },
] as Warehouse[]

const DEMO_DRAFT = draft({})
/** Bán · người nhận 120 ký tự · cùng vật tư hai lô (một lô không hạn, một lô đã hết hạn) · vật tư ngoài danh sách. */
const WORST_DRAFT = draft({
  code: 'PX-2026-ABCDEFGHIJKLMNOPQRSTUVWX',
  purchaseOrder: 'PO-'.padEnd(64, '9'),
  receiver: LONG_RECEIVER,
  items: [
    line({
      materialSlug: 'm-long',
      materialCode: LONG_CODE,
      materialName: LONG_NAME,
      batchSlug: 'b-none',
      quantity: HUGE,
      unitPrice: 987_654_321.99,
    }),
    line({
      materialSlug: 'm-long',
      materialCode: LONG_CODE,
      materialName: LONG_NAME,
      unitSlug: 'u-coil',
      unitCode: 'CUON-2T-TC',
      batchSlug: 'b-old',
      quantity: 1,
      unitPrice: 0,
    }),
    line({ materialSlug: 'm-a', materialCode: 'A', materialName: 'B', quantity: 0.000001 }),
    line({
      materialSlug: 'm-gone',
      materialCode: 'VT-DA-GO-KHOI-KHO',
      materialName: 'Vật tư đã gỡ khỏi kho nhưng còn trên phiếu nháp',
      unitSlug: 'u-box',
      unitCode: 'HOP',
      unitName: 'Hộp',
      quantity: 5,
    }),
  ],
})

function renderSheet(
  form: ExportForm | null,
  stock: InventoryItem[],
  warehouseName: string,
  canReadWarehouses = false,
) {
  server.use(
    mswHttp.get(`${BASE}/warehouses`, () => paginated(TARGET_WAREHOUSES)),
    mswHttp.get(`${BASE}/warehouses/w-a/materials`, () => paginated(stock, { size: 500 })),
    mswHttp.get(`${BASE}/warehouses/w-a/material-batches`, () => paginated(BATCHES)),
    ...(form ? [mswHttp.get(`${URL_W}/${form.slug}`, () => ok(form))] : []),
  )
  return renderWithProviders(
    <ExportFormSheet
      open
      onOpenChange={vi.fn()}
      warehouseSlug="w-a"
      warehouseName={warehouseName}
      formSlug={form?.slug}
      formCode={form?.code}
      canSubmit
      canConfirm
      canApproveDisposal
      canReadWarehouses={canReadWarehouses}
      canPickBatch
    />,
    { auth: 'admin' },
  )
}

const footer = () => document.querySelector<HTMLElement>('[data-slot="sheet-footer"]')!

describe('ExportFormSheet — break-ui', () => {
  it('demo: sửa nháp Bán mở ở ②, tóm tắt + Tổng ở chân', async () => {
    renderSheet(DEMO_DRAFT, DEMO_STOCK, 'Kho A')
    await screen.findByText(/Bán · Giao cho Cửa hàng B · PO PO-12/)
    expect(within(footer()).getByText(/Tổng: 250\.000/)).toBeInTheDocument()
    await dump('demo-items')
  })

  it('worst case: ② — người nhận dài, vật tư 120 ký tự, lô không hạn, vật tư ngoài danh sách', async () => {
    renderSheet(WORST_DRAFT, WORST_STOCK, 'Kho tổng miền Nam — Khu công nghiệp Tân Tạo')
    const summary = await screen.findByText(new RegExp(`Giao cho ${LONG_RECEIVER.slice(0, 20)}`))
    // Tóm tắt dài xuống dòng, nút "sửa" không bị đẩy ra ngoài.
    expect(summary.className).toContain('break-words')
    expect(within(summary.parentElement!).getByRole('button', { name: 'sửa' }).className).toContain(
      'shrink-0',
    )
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Vật tư dòng 1' })).toHaveTextContent(LONG_NAME),
    )
    expect(screen.getByRole('combobox', { name: 'Vật tư dòng 4' })).toHaveTextContent(
      'VT-DA-GO-KHOI-KHO · Vật tư đã gỡ khỏi kho nhưng còn trên phiếu nháp',
    )
    expect(screen.getByRole('combobox', { name: 'Đơn vị dòng 4' })).toHaveTextContent('HOP')
    await dump('worst-items')
  })

  it('worst case: ③ — cảnh báo đơn giá 0 + lô hết hạn, bảng dòng có lô "Không hạn", chân sheet 4 nút', async () => {
    const { user } = renderSheet(WORST_DRAFT, WORST_STOCK, 'Kho A')
    await screen.findByRole('combobox', { name: 'Vật tư dòng 1' })
    await user.click(screen.getByRole('button', { name: /Kiểm tra & gửi$/ }))
    const review = within(
      (await screen.findByRole('heading', { name: 'Kiểm tra phiếu xuất' })).closest('section')!,
    )
    await waitFor(() => expect(review.getAllByText('Không hạn').length).toBeGreaterThan(0))
    expect(screen.getByText(/Dòng 2 · .* — đơn giá 0/)).toBeInTheDocument()
    expect(screen.getByText(/Dòng 2 · .* — lô đã hết hạn/)).toBeInTheDocument()
    // Tên 120 ký tự không khoảng trắng phải được phép gãy trong ô bảng.
    // Danh sách xếp chồng (khung hẹp) dùng `break-words`; ô bảng cần `anywhere` vì bảng co cột theo min-content.
    const names = review.getAllByText(`${LONG_CODE} · ${LONG_NAME}`)
    const stacked = names.find((el) => el.tagName !== 'TD')!
    const tableCell = names.find((el) => el.tagName === 'TD')!
    expect(stacked.className).toContain('break-words')
    expect(tableCell.className).toContain('[overflow-wrap:anywhere]')
    expect(
      within(footer())
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Huỷ', 'Lưu & gửi duyệt', 'Gửi & xác nhận', 'Lưu'])
    await dump('worst-review')
  })

  it('worst case: tạo tới ③ khi dòng vượt khả dụng — lý do khoá nút chiếm cả hàng dưới các nút', async () => {
    const { user } = renderSheet(null, WORST_STOCK, 'Kho A')
    await user.click(await screen.findByRole('radio', { name: 'Bán' }))
    await user.type(screen.getByRole('textbox', { name: /^Người nhận/ }), LONG_RECEIVER)
    await user.type(screen.getByRole('textbox', { name: /^Số PO/ }), 'PO-1')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await user.click(await screen.findByRole('combobox', { name: 'Vật tư dòng 1' }))
    await user.click(await screen.findByRole('option', { name: /^A · B/ }))
    await user.type(screen.getByRole('textbox', { name: 'Số lượng dòng 1' }), '123456789')
    await user.type(screen.getByRole('textbox', { name: 'Đơn giá dòng 1' }), '987654321')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await screen.findByRole('heading', { name: 'Kiểm tra phiếu xuất' })
    const reason = within(footer()).getByText(/vượt số khả dụng/)
    expect(reason.className).toContain('basis-full')
    expect(
      within(footer())
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Quay lại', 'Lưu nháp', 'Lưu & gửi duyệt', 'Gửi & xác nhận'])
    await dump('worst-create-review')
    // Test nặng nhất của tệp (~0.9s một mình): cả bộ chạy song song thì vượt 5s mặc định.
  }, 20_000)

  it('worst case: ① Chuyển kho — kho đích mã / tên rất dài trong ô chọn và sau khi chọn', async () => {
    const { user } = renderSheet(null, WORST_STOCK, 'Kho A', true)
    await user.click(await screen.findByRole('radio', { name: 'Chuyển kho' }))
    const target = await screen.findByRole('combobox', { name: /^Kho nhận/ })
    await user.click(target)
    const longOption = await screen.findByRole('option', {
      name: /KHO-MIEN-NAM-01-ABCDEFGHIJKLMNOP/,
    })
    // Kho hiện tại không có trong danh sách; kho tên một chữ vẫn hiện.
    expect(screen.queryByRole('option', { name: /Kho đang lập phiếu/ })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Kho: B · C' })).toBeInTheDocument()
    await dump('worst-transfer-open')
    await user.click(longOption)
    await waitFor(() => expect(target).toHaveTextContent('Kho: KHO-MIEN-NAM-01-ABCDEFGHIJKLMNOP'))
    await dump('worst-transfer-info')
  })
})
