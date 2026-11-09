import i18n, { changeLanguage, initI18n } from '@/shared/i18n'

import { unitConversionNote, unitOptionHint } from './unit-conversion'

const CHAI = { unitSlug: 'chai', unitName: 'chai', conversionRate: 1, isBaseUnit: true }
const GOI = { unitSlug: 'goi', unitName: 'gói', conversionRate: 24, isBaseUnit: false }
const UNITS = [CHAI, GOI]
const t = (key: string, o?: Record<string, unknown>) => i18n.t(key, o) as string

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

describe('unitConversionNote', () => {
  const note = (
    units: typeof UNITS,
    slug: string,
    quantity: number | null,
    locale: 'vi' | 'en' = 'vi',
  ) => unitConversionNote({ units, unitSlug: slug, quantity, locale, t })

  it('đơn vị gốc → null', () => {
    expect(note(UNITS, 'chai', 5)).toBeNull()
  })
  it('đơn vị không có trong danh sách / chưa có đơn vị gốc → null', () => {
    expect(note(UNITS, 'khac', 5)).toBeNull()
    expect(note([GOI], 'goi', 5)).toBeNull()
  })
  it('tỉ lệ không rõ (0, NaN, âm) → null', () => {
    for (const rate of [0, Number.NaN, -2]) {
      expect(note([CHAI, { ...GOI, conversionRate: rate }], 'goi', 5)).toBeNull()
    }
  })
  it('tỉ lệ 24, số lượng 600 → hai vế, ngăn nghìn theo vi', () => {
    expect(note(UNITS, 'goi', 600)).toBe('1 gói = 24 chai · 600 gói = 14.400 chai')
  })
  it('en: ngăn nghìn theo en', () => {
    expect(note(UNITS, 'goi', 600, 'en')).toBe('1 gói = 24 chai · 600 gói = 14,400 chai')
  })
  it('số lượng trống / 0 → chỉ vế đầu', () => {
    expect(note(UNITS, 'goi', null)).toBe('1 gói = 24 chai')
    expect(note(UNITS, 'goi', 0)).toBe('1 gói = 24 chai')
  })
  it('tỉ lệ lẻ: tới 6 số lẻ, không rác dấu phẩy động', () => {
    const THUNG = { unitSlug: 'thung', unitName: 'thùng', conversionRate: 0.1, isBaseUnit: false }
    expect(note([CHAI, THUNG], 'thung', 3)).toBe('1 thùng = 0,1 chai · 3 thùng = 0,3 chai')
    const X = { ...THUNG, conversionRate: 0.333333 }
    expect(note([CHAI, X], 'thung', 1.5)).toBe('1 thùng = 0,333333 chai · 1,5 thùng = 0,5 chai')
  })
})

describe('unitOptionHint', () => {
  it('đơn vị gốc / không rõ tỉ lệ → null; còn lại "24 chai"', () => {
    expect(unitOptionHint(CHAI, CHAI, 'vi')).toBeNull()
    expect(unitOptionHint(GOI, undefined, 'vi')).toBeNull()
    expect(unitOptionHint({ ...GOI, conversionRate: 0 }, CHAI, 'vi')).toBeNull()
    expect(unitOptionHint(GOI, CHAI, 'vi')).toBe('24 chai')
    expect(unitOptionHint({ ...GOI, conversionRate: 1500 }, CHAI, 'vi')).toBe('1.500 chai')
  })
})
