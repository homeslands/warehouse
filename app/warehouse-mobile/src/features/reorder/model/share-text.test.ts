import { item, unit } from '@/entities/inventory/model/fixtures'
import i18n, { changeLanguage, initI18n } from '@/shared/i18n'

import type { ReorderGroup, ReorderQty, ReorderRow } from './reorder'
import { reorderShareText, shareableRows } from './share-text'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const t = i18n.t.bind(i18n)
// Intl của Node có thể chèn khoảng trắng không ngắt.
const plain = (s: string) => s.replace(/[  ]/g, ' ')

const row = ({
  name = 'Vật tư',
  code = 'VT',
  qty = { value: 1, unitSlug: 'chai' },
  orderedAt = null,
}: {
  name?: string
  code?: string
  qty?: ReorderQty | null
  orderedAt?: string | null
} = {}): ReorderRow => ({
  item: item({
    materialSlug: code.toLowerCase(),
    materialName: name,
    materialCode: code,
    baseUnit: { slug: 'chai', code: 'CHAI', name: 'chai' },
    units: [
      unit({ unitSlug: 'chai', unitCode: 'CHAI', unitName: 'chai', conversionRate: 1 }),
      unit({
        unitSlug: 'thung',
        unitCode: 'THUNG',
        unitName: 'thùng',
        conversionRate: 12,
        isBaseUnit: false,
      }),
    ],
  }),
  level: 'red',
  suggestedBase: 26,
  qty,
  orderedAt,
  suppliers: [],
})

const text = (rows: ReorderRow[], supplierName: string | null = 'Công ty Sữa ABC', locale = 'vi') =>
  plain(
    reorderShareText({
      warehouseName: 'Kho Trung tâm',
      date: new Date(2026, 10, 19),
      supplierName,
      rows,
      t,
      locale,
    }),
  )

describe('reorderShareText', () => {
  it('soạn chữ theo nhóm', () => {
    expect(
      text([row({ name: 'Sữa tươi 1L', code: 'STU01', qty: { value: 26, unitSlug: 'chai' } })]),
    ).toBe(
      'Đề xuất đặt hàng — Kho Trung tâm — 19/11/2026\nGửi: Công ty Sữa ABC\n1. Sữa tươi 1L (STU01) — 26 chai',
    )
  })

  it('supplierName null → bỏ dòng "Gửi:"', () => {
    expect(
      text(
        [row({ name: 'Sữa tươi 1L', code: 'STU01', qty: { value: 26, unitSlug: 'chai' } })],
        null,
      ),
    ).toBe('Đề xuất đặt hàng — Kho Trung tâm — 19/11/2026\n1. Sữa tươi 1L (STU01) — 26 chai')
  })

  it('đánh số thứ tự theo đúng thứ tự dòng', () => {
    expect(
      text(
        [
          row({ name: 'A', code: 'A1', qty: { value: 2, unitSlug: 'chai' } }),
          row({ name: 'B', code: 'B1', qty: { value: 3, unitSlug: 'thung' } }),
        ],
        null,
      ),
    ).toBe('Đề xuất đặt hàng — Kho Trung tâm — 19/11/2026\n1. A (A1) — 2 chai\n2. B (B1) — 3 thùng')
  })

  it('tên đơn vị lấy từ item.units theo unitSlug; số qua formatQuantity', () => {
    const r = row({ name: 'Sữa', code: 'S1', qty: { value: 1234.5, unitSlug: 'thung' } })
    expect(text([r], null).split('\n')[1]).toBe('1. Sữa (S1) — 1.234,5 thùng')
  })

  it('đơn vị không có trong units nhưng là đơn vị gốc → tên đơn vị gốc', () => {
    const r = row({ name: 'Sữa', code: 'S1', qty: { value: 5, unitSlug: 'chai' } })
    r.item = { ...r.item, units: [] }
    expect(text([r], null).split('\n')[1]).toBe('1. Sữa (S1) — 5 chai')
  })

  it('bản en: định dạng số theo en, ngày vẫn dd/MM/yyyy', async () => {
    await changeLanguage('en')
    try {
      const r = row({ name: 'Milk', code: 'M1', qty: { value: 1234.5, unitSlug: 'thung' } })
      expect(text([r], 'ABC Dairy', 'en')).toBe(
        'Reorder request — Kho Trung tâm — 19/11/2026\nTo: ABC Dairy\n1. Milk (M1) — 1,234.5 thùng',
      )
    } finally {
      await changeLanguage('vi')
    }
  })
})

describe('shareableRows', () => {
  const ordered = row({ code: 'DONE', orderedAt: '2026-11-18' })
  const noQty = row({ code: 'NOQ', qty: null })
  const zeroQty = row({ code: 'ZERO', qty: { value: 0, unitSlug: 'chai' } })
  const ok = row({ code: 'OK' })
  const rows = [ordered, noQty, zeroQty, ok]
  const codes = (rs: ReorderRow[]) => rs.map((r) => r.item.materialCode)

  it('bỏ dòng đã đặt và dòng chưa có số (null hoặc 0)', () => {
    expect(codes(shareableRows({ kind: 'none', rows }))).toEqual(['OK'])
    expect(codes(shareableRows({ kind: 'all', rows }))).toEqual(['OK'])
    const supplier = { slug: 'abc', code: 'ABC', name: 'ABC' }
    expect(codes(shareableRows({ kind: 'supplier', supplier, rows }))).toEqual(['OK'])
  })

  it('nhóm choose không bao giờ chia sẻ', () => {
    const group: ReorderGroup = { kind: 'choose', rows: [ok] }
    expect(shareableRows(group)).toEqual([])
  })
})
