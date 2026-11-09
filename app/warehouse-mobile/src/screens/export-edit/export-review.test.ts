import { makeDraft, makeLine } from '@/features/export-draft/model/fixtures'
import i18n, { changeLanguage, initI18n } from '@/shared/i18n'

import { exportReview } from './export-review'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const t = i18n.t.bind(i18n)
const opts = (over: Partial<Parameters<typeof exportReview>[1]> = {}) => ({
  available: () => null,
  lotLabel: () => null,
  t,
  locale: 'vi' as const,
  ...over,
})
const nbsp = (s: string) => s.replace(/ /g, ' ')

describe('exportReview', () => {
  it('lines carry the step-2 row summary (120 cái × 1.200 đ · mã · còn n · Lô tự động | nhãn lô)', () => {
    const draft = makeDraft([
      makeLine(1, { quantity: 120, unitName: 'cái', unitPrice: 1200 }),
      makeLine(2, { quantity: 4, unitPrice: 1250000, batchSlug: 'b-2' }),
    ])
    const r = exportReview(
      draft,
      opts({
        available: (l) => (l.batchSlug ? 9 : 500),
        lotLabel: (l) => (l.batchSlug ? 'HSD 03/2027' : null),
      }),
    )
    expect(r.lines.map((l) => [l.key, l.name])).toEqual([
      [draft.lines[0]!.key, 'Vật tư 1'],
      [draft.lines[1]!.key, 'Vật tư 2'],
    ])
    const [a, b] = r.lines.map((l) => l.summary)
    expect(nbsp(a!.line2)).toBe('120 cái × 1.200 đ')
    expect(nbsp(a!.amount)).toBe('144.000 đ')
    expect(a!.line3.map((x) => x.text)).toEqual(['VT1', 'còn 500 cái', 'Lô tự động'])
    expect(nbsp(b!.line2)).toBe('4 hộp × 1.250.000 đ')
    expect(b!.line3.map((x) => x.text)).toEqual(['VT2', 'còn 9 hộp', 'HSD 03/2027'])
    expect(r.total).toBe(5144000)
    expect(r.footnote).toBe('Gửi duyệt sẽ giữ hàng cho 2 dòng; 1 dòng lấy lô có HSD sớm nhất.')
  })

  it('số lẻ của số lượng theo locale; mọi dòng đã chọn lô → câu ghi chú không nhắc lô tự động', () => {
    const draft = makeDraft([makeLine(1, { quantity: 2.5, unitPrice: 1000, batchSlug: 'b-1' })])
    const r = exportReview(draft, opts({ lotLabel: () => 'HSD 12/03/2027' }))
    expect(nbsp(r.lines[0]!.summary.line2)).toBe('2,5 hộp × 1.000 đ')
    expect(r.lines[0]!.summary.line3.at(-1)!.text).toBe('HSD 12/03/2027')
    expect(r.footnote).toBe('Gửi duyệt sẽ giữ hàng cho 1 dòng theo lô đã chọn.')
  })

  it('thiếu hàng / đơn vị gốc của bước 2 được truyền vào dòng', () => {
    const draft = makeDraft([makeLine(1, { quantity: 2, conversionRate: 10 })])
    const r = exportReview(
      draft,
      opts({
        available: () => 50,
        shortage: () => ({ kind: 'stock', missing: 3 }),
        baseUnitName: () => 'cái',
      }),
    )
    expect(r.lines[0]!.summary.line3).toEqual([
      { text: 'VT1', tone: 'muted' },
      { text: '= 20 cái', tone: 'muted' },
      { text: 'Thiếu 3 hộp', tone: 'destructive' },
      { text: 'Lô tự động', tone: 'muted' },
    ])
  })

  it('infoRows: Loại, Mã phiếu, Số PO, Người nhận; HĐ / Ghi chú chỉ khi có', () => {
    const base = makeDraft([makeLine(1)])
    const full = exportReview(
      { ...base, header: { ...base.header, invoiceCode: 'HD-7', note: 'Giao trước 9h' } },
      opts(),
    )
    expect(full.infoRows).toEqual([
      { key: 'type', label: 'Loại', value: 'Sản xuất' },
      { key: 'code', label: 'Mã phiếu', value: 'PX-1', format: 'code' },
      { key: 'purchaseOrder', label: 'Số PO', value: 'PO-1', format: 'code' },
      { key: 'receiver', label: 'Người nhận', value: base.header.receiver },
      { key: 'invoiceCode', label: 'Số HĐ', value: 'HD-7', format: 'code' },
      { key: 'note', label: 'Ghi chú', value: 'Giao trước 9h', lines: 2 },
    ])
    const bare = exportReview(
      { ...base, header: { ...base.header, invoiceCode: null, note: null } },
      opts(),
    )
    expect(bare.infoRows.map((r) => r.key)).toEqual(['type', 'code', 'purchaseOrder', 'receiver'])
  })

  it('warnings list zero-price count and over-stock names (max 8 + và n dòng khác)', () => {
    const lines = Array.from({ length: 11 }, (_, i) =>
      makeLine(i + 1, { quantity: 10, unitPrice: i < 2 ? 0 : 1000 }),
    )
    const draft = makeDraft(lines)
    // Dòng 1 và 3..12 vượt tồn ("còn 5"); dòng 2 đủ.
    const r = exportReview(draft, opts({ available: (l) => (l.materialSlug === 'm-2' ? 50 : 5) }))
    expect(r.warnings).toEqual([
      '2 dòng có đơn giá 0 đ',
      '10 dòng vượt tồn hiện có: Vật tư 1, Vật tư 3, Vật tư 4, Vật tư 5, Vật tư 6, Vật tư 7, Vật tư 8, Vật tư 9 … và 2 dòng khác',
    ])
    // Dòng vượt tồn: "còn n" cam ở dòng 3 (như bước 2); dòng 2 đủ tồn.
    expect(r.lines.map((l) => l.summary.line3[1]!.tone)).toEqual([
      'warning',
      'muted',
      ...Array(9).fill('warning'),
    ])
  })

  it('no warnings → empty array', () => {
    const draft = makeDraft([makeLine(1), makeLine(2)])
    const r = exportReview(draft, opts({ available: () => 10 }))
    expect(r.warnings).toEqual([])
  })
})
