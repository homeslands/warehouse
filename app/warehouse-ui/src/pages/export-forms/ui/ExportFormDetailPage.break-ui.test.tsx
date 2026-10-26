/**
 * `break-ui`: trang chi tiết + bản in phiếu xuất với dữ liệu xấu nhất — mã 32 ký tự, PO / số HĐ 64 ký tự, người nhận dài,
 * tên vật tư 120 ký tự không dấu cách, dòng bị BE tách lô (cùng vật tư, một lô có hạn, một lô không hạn), Bán với thành
 * tiền 99.999.999.999 ₫ mỗi dòng, 200 dòng. Chạy thường chỉ kiểm bất biến dựng được ở jsdom (không đo layout); đặt
 * `BREAK_UI_OUT=<thư mục>` thì ghi HTML ra đó để chụp (CSS build thật + Chrome headless, bản in qua `--print-to-pdf`) —
 * chỉ dùng khi dev, không phải một phần của app.
 */
import { screen, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import type { ExportForm, ExportFormItem } from '@/entities/export-form'
import type { Warehouse } from '@/entities/warehouse'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithRouter, type TestAuth } from '@/shared/test/render'
import { ExportFormDetailPage } from './ExportFormDetailPage'

const BASE = 'http://localhost:8085/api/v1'
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
  fs.writeFileSync(`${OUT}/detail-${name}.html`, document.body.innerHTML)
}

const LONG_NAME = 'Thep'.repeat(30) // 120 ký tự, không khoảng trắng
const LONG_CODE = 'MAT-THEP-CUON-CB300V-D10-XXXXXXXX'
const LONG_RECEIVER =
  'Kho: KHO-MIEN-NAM-01 · Kho tổng miền Nam — Khu công nghiệp Tân Tạo, quận Bình Tân, Thành phố Hồ Chí Minh, cổng số 3'
const PO_64 = 'PO-'.padEnd(64, '9')
const PER_LINE = 99_999_999_999

const kho = {
  slug: 'w-a',
  code: 'KHO-MIEN-NAM-01',
  name: 'Kho trung tâm phân phối miền Nam — Khu công nghiệp Tân Tạo',
  isActive: true,
} as Warehouse

const item = (overrides: Partial<ExportFormItem> = {}): ExportFormItem => ({
  slug: 'xit-1',
  createdAt: '2026-10-26T02:00:00.000Z',
  updatedAt: '2026-10-26T02:00:00.000Z',
  lineNo: 1,
  materialSlug: 'm-long',
  materialCode: LONG_CODE,
  materialName: LONG_NAME,
  unitSlug: 'u-kg',
  unitCode: 'KG',
  unitName: 'Kilogram',
  batchSlug: null,
  batchExpiryDate: null,
  quantity: 1,
  conversionRate: 1,
  baseQuantity: 1,
  unitPrice: PER_LINE,
  amount: PER_LINE,
  note: null,
  ...overrides,
})

/** Sau gửi duyệt: dòng 1 (vật tư dài) bị tách thành 2 lô — một có hạn, một không hạn; dòng 3 theo thùng 24 chai. */
const WORST: ExportForm = {
  slug: 'xf-1',
  createdAt: '2026-10-26T02:00:00.000Z',
  updatedAt: '2026-10-26T02:00:00.000Z',
  version: 3,
  code: 'PX-2026-ABCDEFGHIJKLMNOPQRSTUVWX',
  type: 'SALE',
  status: 'PENDING',
  purchaseOrder: PO_64,
  invoiceCode: 'HD-'.padEnd(64, '7'),
  requesterSlug: 'u-1',
  requesterName:
    'Nguyễn Phạm Trần Lê Hoàng Phan Huỳnh Vũ Võ Đặng Bùi Thị Thanh Thuỷ Tiên Ngọc Bích Khánh Linh',
  approverSlug: null,
  approverName: null,
  receiver: LONG_RECEIVER,
  totalAmount: PER_LINE * 3,
  note: 'Giao trước 7 giờ sáng, gọi anh Bartholomew ở cổng số 3 — xe tải 2,5 tấn không vào được hẻm, cần trung chuyển.',
  file: 'bien-ban-ban-giao-hang-hoa-kho-mien-nam-dot-2-thang-10-1760000000000.pdf',
  warehouseSlug: 'w-a',
  items: [
    item({ slug: 'xit-1', lineNo: 1, batchSlug: 'b-1', batchExpiryDate: '2026-11-30' }),
    item({ slug: 'xit-2', lineNo: 2, batchSlug: 'b-2', batchExpiryDate: null }),
    item({
      slug: 'xit-3',
      lineNo: 3,
      materialSlug: 'm-a',
      materialCode: 'A',
      materialName: 'B',
      unitSlug: 'u-thung',
      unitCode: 'THUNG-24-CHAI',
      unitName: 'Thùng 24 chai',
      quantity: 999_999.123456,
      conversionRate: 24,
      baseQuantity: 23_999_978.962944,
      unitPrice: 99_999.99,
      amount: PER_LINE,
      note: 'Hàng dễ vỡ — xếp tối đa 3 tầng, không để chung với hoá chất',
    }),
  ],
}

const ADMIN: TestAuth = {
  userName: 'a',
  userSlug: 'u-adm',
  roleName: 'ADMIN',
  scope: [
    'EXPORT_FORM_READ',
    'EXPORT_FORM_DELETE_DRAFT',
    'EXPORT_FORM_CONFIRM',
    'EXPORT_FORM_APPROVE_DISPOSAL',
    'EXPORT_FORM_EXPORT',
    'EXPORT_FORM_UPDATE_DRAFT',
    'WAREHOUSE_READ',
    'MATERIAL_READ',
  ],
}

function renderPage(form: ExportForm) {
  server.use(
    mswHttp.get(`${BASE}/warehouses/w-a`, () => ok(kho)),
    mswHttp.get(`${BASE}/warehouses/w-a/export-forms/xf-1`, () => ok(form)),
    mswHttp.get(`${BASE}/warehouses/w-a/materials`, () => paginated([], { size: 500 })),
    mswHttp.get(`${BASE}/warehouses/w-a/material-batches`, () => paginated([])),
  )
  return renderWithRouter([{ path: '/export-forms/:slug', element: <ExportFormDetailPage /> }], {
    route: '/export-forms/xf-1?warehouse=w-a',
    auth: ADMIN,
  })
}

const screenTable = () =>
  within(screen.getByRole('region', { name: 'Chi tiết vật tư' })).getByRole('table')

describe('ExportFormDetailPage — break-ui', () => {
  it('worst case: dòng tách lô cùng vật tư, lô không hạn, thành tiền 99.999.999.999 ₫ — đủ dòng, đủ chữ', async () => {
    renderPage(WORST)
    await screen.findByRole('heading', { level: 1, name: WORST.code })
    await screen.findAllByText(`${kho.code} · ${kho.name}`)
    const table = within(screenTable())
    // 3 dòng dữ liệu + 1 dòng tiêu đề + 1 dòng tổng; hai dòng đầu cùng vật tư, không báo trùng.
    expect(table.getAllByRole('row')).toHaveLength(5)
    expect(table.getAllByText(new RegExp(`· ${LONG_NAME}$`))).toHaveLength(2)
    expect(table.getByText('HSD 30/11/2026')).toBeInTheDocument()
    expect(table.getByText('Lô không hạn')).toBeInTheDocument()
    // 2 ô đơn giá (dòng 1–2) + 3 ô thành tiền.
    expect(table.getAllByText(/99\.999\.999\.999\s₫/)).toHaveLength(5)
    expect(table.getByText(/299\.999\.999\.997\s₫/)).toBeInTheDocument()
    // Số tiền / số lượng không bị cắt: ô tiền không có `truncate`.
    for (const cell of table.getAllByText(/99\.999\.999\.999\s₫/)) {
      expect(cell.className).not.toContain('truncate')
    }
    // PO 64 ký tự không có dấu cách: ô thông tin phải gãy được.
    expect(screen.getAllByText(PO_64)[0].className).toMatch(/break-words|overflow-wrap/)
    // Bản in có cùng dữ liệu.
    const print = within(screen.getByTestId('export-form-print'))
    expect(print.getByText('Lô không hạn')).toBeInTheDocument()
    expect(print.getByText(new RegExp(PO_64))).toBeInTheDocument()
    await dump('worst')
  })

  it('đủ 200 dòng: trang và bản in dựng đủ dòng', async () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      item({ slug: `xit-${i}`, lineNo: i + 1, quantity: i + 1, amount: PER_LINE }),
    )
    renderPage({ ...WORST, items })
    await screen.findByRole('heading', { level: 1, name: WORST.code })
    // 200 dòng + tiêu đề + tổng, ở cả bảng trên màn lẫn bản in.
    expect(within(screenTable()).getAllByRole('row')).toHaveLength(202)
    expect(
      within(screen.getByTestId('export-form-print')).getAllByRole('row', { hidden: true }),
    ).toHaveLength(202)
  }, 30_000)
})
