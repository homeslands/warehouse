import { makeItem, makeLine } from './fixtures'
import i18n, { changeLanguage, initI18n } from '@/shared/i18n'

import { exportItemAsLine, exportLineSummary } from './export-line-summary'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const t = i18n.t.bind(i18n)
const ctx = (over: Partial<Parameters<typeof exportLineSummary>[1]> = {}) => ({
  available: null,
  lotLabel: null,
  baseUnitName: null,
  t,
  locale: 'vi' as const,
  ...over,
})
const texts = (segments: { text: string }[]) => segments.map((s) => s.text)
// Intl của Node có thể chèn khoảng trắng không ngắt trước "đ".
const plain = (s: string) => s.replace(/ /g, ' ')

describe('exportLineSummary', () => {
  it('export line with qty and price → "12 bình × 12.000 đ"', () => {
    const line = makeLine(1, { quantity: 12, unitPrice: 12000, unitName: 'bình' })
    const s = exportLineSummary(line, ctx({ available: 100 }))
    expect(plain(s.line2)).toBe('12 bình × 12.000 đ')
    expect(s.line2Tone).toBe('normal')
    expect(plain(s.amount)).toBe('144.000 đ')
    expect(s.amountTone).toBe('normal')
    expect(s.missing).toBe(false)
    expect(s.line3).toEqual([
      { text: 'VT1', tone: 'muted' },
      { text: 'còn 100 bình', tone: 'muted' },
      { text: 'Lô tự động', tone: 'muted' },
    ])
    expect(plain(s.a11y)).toBe(
      'Vật tư 1, 12 bình × 12.000 đ, 144.000 đ, VT1, còn 100 bình, Lô tự động',
    )
  })

  it('export missing price → warning "12 hộp · Chưa nhập đơn giá" (quantity kept) and amount "—" warning', () => {
    const s = exportLineSummary(makeLine(1, { quantity: 12, unitPrice: null }), ctx())
    expect(s.line2).toBe('12 hộp · Chưa nhập đơn giá')
    expect(s.line2Tone).toBe('warning')
    expect(s.amount).toBe('—')
    expect(s.amountTone).toBe('warning')
    expect(s.missing).toBe(true)
    // "—" không đọc lên; thiếu gì có trong nhãn.
    expect(s.a11y).toBe('Vật tư 1, 12 hộp · Chưa nhập đơn giá, VT1, Lô tự động')
  })

  it('thiếu số → "Chưa nhập số lượng"; thiếu cả hai → "Chưa nhập số lượng, đơn giá"', () => {
    expect(exportLineSummary(makeLine(1, { quantity: 0, unitPrice: 5 }), ctx()).line2).toBe(
      'Chưa nhập số lượng',
    )
    const both = exportLineSummary(makeLine(1, { quantity: 0, unitPrice: null }), ctx())
    expect(both.line2).toBe('Chưa nhập số lượng, đơn giá')
    expect(both.missing).toBe(true)
  })

  it('lô đã chọn → nhãn lô; đơn vị không phải gốc → "= n <đv gốc>"; vượt "còn n" → cam', () => {
    const line = makeLine(1, { quantity: 2, unitName: 'thùng', conversionRate: 24 })
    const s = exportLineSummary(
      line,
      ctx({ available: 1, lotLabel: 'HSD 12/03/2027 · nhập 05/10', baseUnitName: 'hộp' }),
    )
    expect(s.line3).toEqual([
      { text: 'VT1', tone: 'muted' },
      { text: '= 48 hộp', tone: 'muted' },
      { text: 'còn 1 thùng', tone: 'warning' },
      { text: 'HSD 12/03/2027 · nhập 05/10', tone: 'muted' },
    ])
  })

  it('thiếu hàng sau gửi duyệt lỗi → "Thiếu n <đv>" đỏ thay "còn n"', () => {
    const line = makeLine(1, { quantity: 10 })
    const stock = exportLineSummary(
      line,
      ctx({ available: 4, shortage: { kind: 'stock', missing: 6 } }),
    )
    expect(stock.line3[1]).toEqual({ text: 'Thiếu 6 hộp', tone: 'destructive' })
    expect(texts(stock.line3)).not.toContain('còn 4 hộp')
    const batch = exportLineSummary(line, ctx({ shortage: { kind: 'batch', available: 3 } }))
    expect(batch.line3[1]).toEqual({ text: 'Lô chỉ còn 3 hộp', tone: 'destructive' })
    const unknown = exportLineSummary(line, ctx({ available: 4, shortage: true }))
    expect(unknown.line3[1]).toEqual({ text: 'Không đủ hàng', tone: 'destructive' })
  })

  it('changedOnServer / duplicate / expiry-before-date appear in line3 with tones', () => {
    const s = exportLineSummary(makeLine(1, { changedOnServer: true }), ctx({ duplicate: true }))
    expect(s.line3.slice(-2)).toEqual([
      { text: 'Đã đổi ở nơi khác — xem lại', tone: 'warning' },
      { text: 'Trùng dòng khác (cùng vật tư, đơn vị, lô)', tone: 'destructive' },
    ])
    // Trùng dòng là mục "còn thiếu" của bước 2.
    expect(s.missing).toBe(true)
    expect(s.a11y).toContain('Đã đổi ở nơi khác — xem lại')
  })

  it('line note → muted single-line truncated excerpt appended to line 3 (first line only, ≤ 40 chars + …)', () => {
    const short = exportLineSummary(makeLine(1, { note: '  Giao trước 9h \nGọi anh Tâm' }), ctx())
    expect(short.line3.at(-1)).toEqual({ text: 'Giao trước 9h', tone: 'muted' })
    expect(short.a11y).toMatch(/, Giao trước 9h$/)
    const long = exportLineSummary(
      makeLine(1, { note: 'Hàng dễ vỡ, xếp riêng thùng gỗ và chèn xốp kỹ trước khi giao cho xe' }),
      ctx(),
    )
    expect(long.line3.at(-1)).toEqual({
      text: 'Hàng dễ vỡ, xếp riêng thùng gỗ và chèn x…',
      tone: 'muted',
    })
    // Ghi chú trống / chỉ khoảng trắng → không thêm đoạn.
    expect(texts(exportLineSummary(makeLine(1, { note: ' \n ' }), ctx()).line3)).toEqual([
      'VT1',
      'Lô tự động',
    ])
  })
})

describe('exportItemAsLine', () => {
  it('giữ lô / HSD lô / quy đổi / giá / ghi chú; key = slug, base null', () => {
    const item = makeItem(2, {
      batchSlug: 'b-1',
      batchExpiryDate: '2027-05-06',
      conversionRate: 12,
      unitPrice: 7000,
      note: 'ghi',
    })
    const l = exportItemAsLine(item)
    expect(l).toMatchObject({
      key: item.slug,
      batchSlug: 'b-1',
      batchExpiryDate: '2027-05-06',
      conversionRate: 12,
      unitPrice: 7000,
      note: 'ghi',
      base: null,
    })
  })

  it('lotLabel false → không vẽ đoạn lô; null → vẫn "Lô tự động"', () => {
    const line = makeLine(1)
    expect(texts(exportLineSummary(line, ctx({ lotLabel: false })).line3)).toEqual(['VT1'])
    expect(texts(exportLineSummary(line, ctx({ lotLabel: null })).line3)).toContain('Lô tự động')
  })
})
