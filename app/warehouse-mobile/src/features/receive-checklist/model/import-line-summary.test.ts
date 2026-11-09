import { makeItem, makeLine } from './fixtures'
import i18n, { changeLanguage, initI18n } from '@/shared/i18n'

import { importItemAsLine, importLineSummary } from './import-line-summary'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const ctx = { formDate: '2026-11-04', t: i18n.t.bind(i18n), locale: 'vi' as const }
// Intl của Node có thể chèn khoảng trắng không ngắt trước "đ".
const plain = (s: string) => s.replace(/ /g, ' ')

describe('importLineSummary', () => {
  it('đủ số + giá → "12 thùng × 12.000 đ", thành tiền thường, line3 = mã · HSD', () => {
    const line = makeLine(1, { quantity: 12, unitPrice: 12000, unitName: 'thùng' })
    const s = importLineSummary({ ...line, expiryDate: '2027-03-12' }, ctx)
    expect(plain(s.line2)).toBe('12 thùng × 12.000 đ')
    expect(s.line2Tone).toBe('normal')
    expect(plain(s.amount)).toBe('144.000 đ')
    expect(s.amountTone).toBe('normal')
    expect(s.line3).toEqual([
      { text: 'VT1', tone: 'muted' },
      { text: 'HSD 12/03/2027', tone: 'muted' },
    ])
    expect(s.missing).toBe(false)
  })

  it('import empty price → "12 thùng · Chưa có giá" muted, not missing', () => {
    const s = importLineSummary(makeLine(1, { quantity: 12, unitPrice: 0, unitName: 'thùng' }), ctx)
    expect(s.line2).toBe('12 thùng · Chưa có giá')
    expect(s.line2Tone).toBe('muted')
    // Giá trống = 0 đ (hợp lệ): thành tiền "0 đ" mờ, không bao giờ cam.
    expect(plain(s.amount)).toBe('0 đ')
    expect(s.amountTone).toBe('muted')
    expect(s.missing).toBe(false)
    expect(s.line3).toEqual([
      { text: 'VT1', tone: 'muted' },
      { text: 'Không HSD', tone: 'muted' },
    ])
  })

  it('số 0 → "Chưa nhập số lượng" cam, "—" mờ (không cam ở phiếu nhập), missing', () => {
    const s = importLineSummary(makeLine(1, { quantity: 0, base: null }), ctx)
    expect(s.line2).toBe('Chưa nhập số lượng')
    expect(s.line2Tone).toBe('warning')
    expect(s.amount).toBe('—')
    expect(s.amountTone).toBe('muted')
    expect(s.missing).toBe(true)
    // Dòng thêm trên máy: không có gợi ý "Nhập số hoặc xoá dòng".
    expect(s.line3.map((x) => x.text)).not.toContain('Nhập số hoặc xoá dòng')
  })

  it('dòng số 0 có sẵn trên server ("Không nhận" của checklist) → thêm "Nhập số hoặc xoá dòng"', () => {
    const s = importLineSummary(makeLine(2, { quantity: 0 }), ctx)
    expect(s.line3).toContainEqual({ text: 'Nhập số hoặc xoá dòng', tone: 'muted' })
    expect(s.a11y).toContain('Nhập số hoặc xoá dòng')
  })

  it('changedOnServer / duplicate / expiry-before-date appear in line3 with tones', () => {
    const line = { ...makeLine(1, { changedOnServer: true }), expiryDate: '2026-10-01' }
    const s = importLineSummary(line, ctx)
    expect(s.line3).toEqual([
      { text: 'VT1', tone: 'muted' },
      { text: 'HSD 01/10/2026', tone: 'muted' },
      { text: 'Đã đổi ở nơi khác — xem lại', tone: 'warning' },
      { text: 'HSD trước ngày nhập', tone: 'warning' },
    ])
    // HSD trước ngày nhập là mục "còn thiếu" của bước 2.
    expect(s.missing).toBe(true)
    expect(plain(s.a11y)).toBe(
      'Vật tư 1, 10 bao × 1.000 đ, 10.000 đ, VT1, HSD 01/10/2026, Đã đổi ở nơi khác — xem lại, HSD trước ngày nhập',
    )
  })

  it('line note → muted single-line excerpt appended to line 3, after the warnings', () => {
    const line = makeLine(1, { changedOnServer: true, note: 'Thùng móp góc\nđã chụp ảnh' })
    const s = importLineSummary(line, ctx)
    expect(s.line3.slice(-2)).toEqual([
      { text: 'Đã đổi ở nơi khác — xem lại', tone: 'warning' },
      { text: 'Thùng móp góc', tone: 'muted' },
    ])
    expect(s.a11y).toMatch(/, Thùng móp góc$/)
    expect(importLineSummary(makeLine(1), ctx).line3.map((x) => x.text)).toEqual([
      'VT1',
      'Không HSD',
    ])
  })
})

describe('importItemAsLine', () => {
  it('giữ các trường hiển thị của dòng phiếu; key = slug, base null, chưa kiểm', () => {
    const item = makeItem(3, {
      unitPrice: 5000,
      quantity: 4,
      expiryDate: '2027-01-02',
      note: 'ghi',
      supplierSlug: 's-1',
      supplierName: 'Cty A',
    })
    const l = importItemAsLine(item)
    expect(l).toMatchObject({
      key: item.slug,
      materialName: item.materialName,
      materialCode: item.materialCode,
      unitName: item.unitName,
      unitPrice: 5000,
      quantity: 4,
      expiryDate: '2027-01-02',
      note: 'ghi',
      supplierSlug: 's-1',
      supplierName: 'Cty A',
      base: null,
      checked: false,
      changedOnServer: false,
    })
  })

  it('giá 0 → "Chưa có giá"; không HSD → "Không HSD"; ghi chú nằm ở line3', () => {
    const item = makeItem(1, { unitPrice: 0, expiryDate: null, note: 'giao sáng' })
    const s = importLineSummary(importItemAsLine(item), ctx)
    expect(s.line2).toContain('Chưa có giá')
    expect(s.line3.map((x) => x.text)).toContain('Không HSD')
    expect(s.line3.map((x) => x.text)).toContain('giao sáng')
  })
})
