import { makeDraft, makeLine } from '@/features/receive-checklist/model/fixtures'
import i18n, { changeLanguage, initI18n } from '@/shared/i18n'

import { importReview } from './import-review'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const t = i18n.t.bind(i18n)
const opts = (over: Partial<Parameters<typeof importReview>[1]> = {}) => ({
  supplierName: null,
  t,
  locale: 'vi' as const,
  ...over,
})
const nbsp = (s: string) => s.replace(/ /g, ' ')

describe('importReview', () => {
  it('lines carry the step-2 row summary (12 thùng × 540.000 đ · mã · HSD), total, footnote', () => {
    const draft = makeDraft([
      makeLine(1, { quantity: 12, unitName: 'thùng', unitPrice: 540000, expiryDate: '2028-08-15' }),
      makeLine(2, { quantity: 2.5, unitPrice: 1000 }),
    ])
    const r = importReview(draft, opts())
    expect(r.lines.map((l) => [l.key, l.name])).toEqual([
      [draft.lines[0]!.key, 'Vật tư 1'],
      [draft.lines[1]!.key, 'Vật tư 2'],
    ])
    const [a, b] = r.lines.map((l) => l.summary)
    expect(nbsp(a!.line2)).toBe('12 thùng × 540.000 đ')
    expect(nbsp(a!.amount)).toBe('6.480.000 đ')
    expect(a!.line3.map((x) => x.text)).toEqual(['VT1', 'HSD 15/08/2028'])
    expect(nbsp(b!.line2)).toBe('2,5 bao × 1.000 đ')
    expect(b!.line3.map((x) => x.text)).toEqual(['VT2', 'Không HSD'])
    expect(r.total).toBe(6482500)
    expect(r.warnings).toEqual([])
    expect(r.footnote).toBe(
      'Phiếu được lưu ở trạng thái Nháp; người có quyền sẽ kiểm hàng và xác nhận nhập kho.',
    )
  })

  it('zero price reads "· Chưa có giá" (grey) and is counted in warnings', () => {
    const draft = makeDraft([
      makeLine(1, { quantity: 5, unitPrice: 0 }),
      makeLine(2, { quantity: 1, unitPrice: 0, expiryDate: '2027-03-01' }),
      makeLine(3, { quantity: 1, unitPrice: 2000 }),
    ])
    const r = importReview(draft, opts())
    expect(r.lines.map((l) => [l.summary.line2, l.summary.line2Tone])).toEqual([
      ['5 bao · Chưa có giá', 'muted'],
      ['1 bao · Chưa có giá', 'muted'],
      [expect.stringMatching(/^1 bao × 2\.000\sđ$/), 'normal'],
    ])
    expect(r.lines.map((l) => nbsp(l.summary.amount))).toEqual(['0 đ', '0 đ', '2.000 đ'])
    expect(r.warnings).toEqual(['2 dòng có đơn giá 0 đ'])
  })

  it('infoRows: Bên bán, Số HĐ, Ngày nhập, Mã phiếu; Số PO / Ghi chú chỉ khi có', () => {
    const base = makeDraft([makeLine(1)])
    const full = importReview(
      {
        ...base,
        header: { ...base.header, purchaseOrder: 'PO-7', note: 'Giao trước 9h' },
      },
      opts({ supplierName: 'Hoà Phát' }),
    )
    expect(full.infoRows).toEqual([
      { key: 'supplier', label: 'Bên bán', value: 'Hoà Phát' },
      { key: 'invoiceCode', label: 'Số HĐ', value: 'HD-1', format: 'code' },
      { key: 'date', label: 'Ngày nhập', value: '04/11/2026', format: 'numeric' },
      { key: 'code', label: 'Mã phiếu', value: 'PN-1', format: 'code' },
      { key: 'purchaseOrder', label: 'Số PO', value: 'PO-7', format: 'code' },
      { key: 'note', label: 'Ghi chú', value: 'Giao trước 9h', lines: 2 },
    ])
    // Không có bên bán (không chọn được / phiếu không có) → không có dòng Bên bán.
    const bare = importReview(base, opts())
    expect(bare.infoRows.map((r) => r.key)).toEqual(['invoiceCode', 'date', 'code'])
  })

  it('en: Exp / No expiry / No price', () => {
    const draft = makeDraft([
      makeLine(1, { quantity: 1, unitPrice: 0 }),
      makeLine(2, { quantity: 1, unitPrice: 1000, expiryDate: '2028-08-15' }),
    ])
    const r = importReview(draft, opts({ locale: 'en', t: i18n.getFixedT('en') }))
    expect(r.lines[0]!.summary.line2).toBe('1 bao · No price')
    expect(r.lines[0]!.summary.line3.map((x) => x.text)).toEqual(['VT1', 'No expiry'])
    expect(nbsp(r.lines[1]!.summary.line2)).toBe('1 bao × 1,000 đ')
    expect(r.lines[1]!.summary.line3.map((x) => x.text)).toEqual(['VT2', 'Exp 15/08/2028'])
    expect(r.warnings).toEqual(['1 line has a unit price of 0 đ'])
  })
})
