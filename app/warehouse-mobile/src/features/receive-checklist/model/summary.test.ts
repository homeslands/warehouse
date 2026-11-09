import { buildSummary } from './summary'
import { makeDraft, makeForm, makeItem, makeLine } from './fixtures'

const b = (quantity: number) => ({ quantity, expiryDate: null, note: null })

describe('buildSummary', () => {
  it('mockup bước 3: 10 khớp, Xi măng 50 → 48 bao, Sơn 6 → 5 thùng, tổng = Σ mới', () => {
    const lines = [
      makeLine(1, {
        materialName: 'Xi măng',
        unitName: 'bao',
        base: b(50),
        quantity: 48,
        checked: true,
        unitPrice: 90000,
      }),
      makeLine(2, {
        materialName: 'Sơn',
        unitName: 'thùng',
        base: b(6),
        quantity: 5,
        checked: true,
        unitPrice: 1500000,
      }),
      ...Array.from({ length: 10 }, (_, i) => makeLine(i + 3, { checked: true })),
    ]
    const s = buildSummary(makeDraft(lines))
    expect(s.matched).toBe(10)
    expect(s.changes).toEqual([
      { kind: 'qty', name: 'Xi măng', unit: 'bao', from: 50, to: 48 },
      { kind: 'qty', name: 'Sơn', unit: 'thùng', from: 6, to: 5 },
    ])
    expect(s.dropped).toEqual([])
    expect(s.total).toBe(48 * 90000 + 5 * 1500000 + 10 * 10 * 1000)
  })
  it('dòng 0 vào dropped, không vào changes, không vào tổng', () => {
    const s = buildSummary(
      makeDraft([
        makeLine(1, { materialName: 'A', quantity: 0, checked: true }),
        makeLine(2, { quantity: 2, base: b(2), unitPrice: 5 }),
      ]),
    )
    expect(s.dropped).toEqual([{ name: 'A' }])
    expect(s.changes).toEqual([])
    expect(s.total).toBe(10)
  })
  it('dòng thêm trên máy: from null', () => {
    const s = buildSummary(
      makeDraft([makeLine(1, { materialName: 'Mới', unitName: 'cái', base: null, quantity: 3 })]),
    )
    expect(s.changes).toEqual([{ kind: 'qty', name: 'Mới', unit: 'cái', from: null, to: 3 }])
  })
  it('hạn dùng đổi (số bằng) → mục "expiry" cũ → mới, KHÔNG tính vào "giữ nguyên"', () => {
    const s = buildSummary(
      makeDraft([
        makeLine(1, {
          materialName: 'Sữa',
          base: { quantity: 10, expiryDate: '2028-08-15', note: null },
          expiryDate: '2028-09-01',
        }),
        makeLine(2, { base: b(10), expiryDate: '2027-01-01' }),
        makeLine(3),
      ]),
    )
    expect(s.changes).toEqual([
      { kind: 'expiry', name: 'Sữa', from: '2028-08-15', to: '2028-09-01' },
      { kind: 'expiry', name: 'Vật tư 2', from: null, to: '2027-01-01' },
    ])
    expect(s.matched).toBe(1)
  })
  it('ghi chú đổi → mục "note"; ghi chú rỗng và null là một', () => {
    const s = buildSummary(
      makeDraft([
        makeLine(1, { note: 'rách bao' }),
        makeLine(2, { note: '  ' }),
        makeLine(3, { base: { quantity: 10, expiryDate: null, note: 'cũ' }, note: null }),
      ]),
    )
    expect(s.changes).toEqual([
      { kind: 'note', name: 'Vật tư 1' },
      { kind: 'note', name: 'Vật tư 3' },
    ])
    expect(s.matched).toBe(1)
  })
  it('một dòng đổi cả số, hạn, ghi chú → ba mục liền nhau, theo thứ tự dòng', () => {
    const s = buildSummary(
      makeDraft([
        makeLine(1, { quantity: 8, expiryDate: '2027-01-01', note: 'x' }),
        makeLine(2, { quantity: 9 }),
      ]),
    )
    expect(s.changes.map((c) => `${c.kind} ${c.name}`)).toEqual([
      'qty Vật tư 1',
      'expiry Vật tư 1',
      'note Vật tư 1',
      'qty Vật tư 2',
    ])
  })
  it('dòng thêm trên máy chỉ có mục số (không có hạn/ghi chú "cũ" để ghi đè)', () => {
    const s = buildSummary(
      makeDraft([makeLine(1, { base: null, quantity: 3, expiryDate: '2027-01-01', note: 'x' })]),
    )
    expect(s.changes).toEqual([{ kind: 'qty', name: 'Vật tư 1', unit: 'bao', from: null, to: 3 }])
  })
  it('tổng ≥ 1e12 chính xác tới đồng', () => {
    const lines = [
      makeLine(1, { quantity: 1, unitPrice: 999999999999.99 }),
      makeLine(2, { quantity: 3, unitPrice: 333333333333.33 }),
      makeLine(3, { quantity: 0.000001, unitPrice: 1000000 }),
    ]
    // 999999999999.99 + 999999999999.99 + 1 (0.000001 × 1e6 = 1)
    expect(buildSummary(makeDraft(lines)).total).toBe(2000000000000.98)
  })
  it('không rác dấu phẩy động', () => {
    const lines = Array.from({ length: 3 }, (_, i) =>
      makeLine(i + 1, { quantity: 1, unitPrice: 0.1 }),
    )
    expect(buildSummary(makeDraft(lines)).total).toBe(0.3)
  })
})

describe('buildSummary — sửa ở màn soạn (đơn vị, giá, xoá dòng, đầu phiếu)', () => {
  /** Phiếu trên server: Sữa 24 hộp (dòng 1), Vật tư 2, Vật tư 3. */
  const form = makeForm([
    makeItem(1, { materialName: 'Sữa', unitName: 'hộp', quantity: 24 }),
    makeItem(2),
    makeItem(3),
  ])
  const server = () => [
    makeLine(1, { materialName: 'Sữa', unitName: 'hộp', base: b(24), quantity: 24 }),
    makeLine(2),
    makeLine(3),
  ]

  it('đổi đơn vị → mục "unit": số + đơn vị cũ → số + đơn vị mới (không có mục "qty")', () => {
    const lines = server()
    lines[0] = { ...lines[0]!, key: 'm-1|u-x', unitSlug: 'u-x', unitName: 'thùng', quantity: 1 }
    const s = buildSummary(makeDraft(lines), form)
    expect(s.changes).toEqual([
      {
        kind: 'unit',
        name: 'Sữa',
        from: { quantity: 24, unit: 'hộp' },
        to: { quantity: 1, unit: 'thùng' },
      },
    ])
    expect(s.matched).toBe(2)
    expect(s.removed).toEqual([])
  })
  it('đổi đơn vị, số giữ nguyên → vẫn là mục "unit"', () => {
    const lines = server()
    lines[0] = { ...lines[0]!, key: 'm-1|u-x', unitSlug: 'u-x', unitName: 'thùng' }
    expect(buildSummary(makeDraft(lines), form).changes).toEqual([
      {
        kind: 'unit',
        name: 'Sữa',
        from: { quantity: 24, unit: 'hộp' },
        to: { quantity: 24, unit: 'thùng' },
      },
    ])
  })
  it('không có phiếu: tên đơn vị cũ lấy từ snapshot đơn vị của dòng', () => {
    const lines = server()
    lines[0] = {
      ...lines[0]!,
      key: 'm-1|u-x',
      unitSlug: 'u-x',
      unitName: 'thùng',
      quantity: 1,
      units: [
        { unitSlug: 'u-1', unitCode: 'H', unitName: 'hộp', conversionRate: 1, isBaseUnit: true },
        {
          unitSlug: 'u-x',
          unitCode: 'T',
          unitName: 'thùng',
          conversionRate: 24,
          isBaseUnit: false,
        },
      ],
    }
    expect(buildSummary(makeDraft(lines)).changes[0]).toEqual({
      kind: 'unit',
      name: 'Sữa',
      from: { quantity: 24, unit: 'hộp' },
      to: { quantity: 1, unit: 'thùng' },
    })
  })
  it('chỉ đổi giá → mục "price" cũ → mới, KHÔNG tính vào "giữ nguyên"', () => {
    const lines = server()
    lines[1] = { ...lines[1]!, unitPrice: 1200 }
    const s = buildSummary(makeDraft(lines), form)
    expect(s.changes).toEqual([{ kind: 'price', name: 'Vật tư 2', from: 1000, to: 1200 }])
    expect(s.matched).toBe(2)
  })
  it('thứ tự trong một dòng: đơn vị/số → giá → hạn → ghi chú', () => {
    const lines = server()
    lines[1] = { ...lines[1]!, quantity: 5, unitPrice: 2000, expiryDate: '2027-01-01', note: 'x' }
    expect(buildSummary(makeDraft(lines), form).changes.map((c) => c.kind)).toEqual([
      'qty',
      'price',
      'expiry',
      'note',
    ])
  })
  it('dòng server bị xoá trên máy → "removed" theo thứ tự trên phiếu; dòng đổi đơn vị không bị coi là xoá', () => {
    const lines = server()
    lines[0] = { ...lines[0]!, key: 'm-1|u-x', unitSlug: 'u-x', unitName: 'thùng', quantity: 1 }
    const s = buildSummary(makeDraft([lines[0]!]), form)
    expect(s.removed).toEqual([{ name: 'Vật tư 2' }, { name: 'Vật tư 3' }])
    expect(s.dropped).toEqual([])
    expect(s.total).toBe(1 * 1000)
  })
  it('đầu phiếu đổi → "header" theo thứ tự ô; PO / ghi chú rỗng và null là một', () => {
    const base = makeDraft(server()).header
    const s = buildSummary(
      makeDraft(server(), {
        header: { ...base, note: 'giao trễ', invoiceCode: 'HD-2', purchaseOrder: '' },
        headerBase: base,
      }),
      form,
    )
    expect(s.header).toEqual(['invoiceCode', 'note'])
    expect(s.changes).toEqual([])
    expect(s.matched).toBe(3)
  })
  it('phiếu mới (headerBase null) → không có "header", không có "removed"', () => {
    const s = buildSummary(
      makeDraft([makeLine(1, { base: null })], {
        formSlug: 'new',
        version: null,
        headerBase: null,
      }),
    )
    expect(s.header).toEqual([])
    expect(s.removed).toEqual([])
  })
  it('checklist không đổi gì ở màn soạn: kết quả như trước, có hay không truyền phiếu', () => {
    const lines = [
      makeLine(1, { quantity: 8, expiryDate: '2026-12-01', checked: true }),
      makeLine(2, { quantity: 0, checked: true }),
      makeLine(3, { checked: true }),
    ]
    const f = makeForm([makeItem(1), makeItem(2), makeItem(3)])
    const expected = {
      matched: 1,
      header: [],
      changes: [
        { kind: 'qty', name: 'Vật tư 1', unit: 'bao', from: 10, to: 8 },
        { kind: 'expiry', name: 'Vật tư 1', from: null, to: '2026-12-01' },
      ],
      dropped: [{ name: 'Vật tư 2' }],
      removed: [],
      total: 18000,
    }
    expect(buildSummary(makeDraft(lines), f)).toEqual(expected)
    expect(buildSummary(makeDraft(lines))).toEqual(expected)
  })
})
