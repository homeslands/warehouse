import {
  baseKey,
  canSave,
  draftFromForm,
  hasEdits,
  headerFromForm,
  isDirty,
  lineKey,
  toCreateInput,
  toUpdateInput,
  toUpdateItems,
} from './draft'
import { makeDraft, makeForm, makeItem, makeLine } from './fixtures'

describe('lineKey', () => {
  it('ghép vật tư và đơn vị', () => {
    expect(lineKey({ materialSlug: 'a', unitSlug: 'b' })).toBe('a|b')
  })
})

describe('draftFromForm', () => {
  it('sắp theo lineNo, chưa kiểm, base = số trên phiếu, header NCC suy ra', () => {
    const form = makeForm([
      makeItem(2, { lineNo: 2, supplierSlug: 's1', supplierName: 'NCC 1' }),
      makeItem(1, { lineNo: 1, quantity: 5, supplierSlug: 's1', supplierName: 'NCC 1' }),
    ])
    const d = draftFromForm(form)
    expect(d.formSlug).toBe('pn-1')
    expect(d.version).toBe(3)
    expect(d.lines.map((l) => l.key)).toEqual(['m-1|u-1', 'm-2|u-2'])
    expect(d.lines[0]).toMatchObject({
      checked: false,
      changedOnServer: false,
      quantity: 5,
      base: { unitSlug: 'u-1', quantity: 5, unitPrice: 1000, expiryDate: null, note: null },
      supplierName: 'NCC 1',
    })
    expect(d.headerBase).toEqual(d.header)
    expect(d.header).toMatchObject({ code: 'PN-1', date: '2026-11-04', supplierSlug: 's1' })
  })
})

describe('toUpdateItems', () => {
  it('bỏ dòng 0, giữ expiryDate null, làm tròn số 6 và giá 2', () => {
    const d = makeDraft([
      makeLine(1, { quantity: 12.3456781, unitPrice: 10.005 }),
      makeLine(2, { quantity: 0 }),
    ])
    const items = toUpdateItems(d)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      materialSlug: 'm-1',
      unitSlug: 'u-1',
      quantity: 12.345678,
      unitPrice: 10.01,
      expiryDate: null,
    })
    expect('expiryDate' in items[0]).toBe(true)
  })
  it('kèm supplierSlug và note khi có', () => {
    const d = makeDraft([makeLine(1, { supplierSlug: 's1', note: 'x', expiryDate: '2027-01-01' })])
    expect(toUpdateItems(d)[0]).toMatchObject({
      supplierSlug: 's1',
      note: 'x',
      expiryDate: '2027-01-01',
    })
  })
})

describe('canSave', () => {
  it('mọi dòng 0 → allZero', () => {
    expect(canSave(makeDraft([makeLine(1, { quantity: 0 })]))).toEqual({
      ok: false,
      reason: 'allZero',
    })
    expect(canSave(makeDraft([]))).toEqual({ ok: false, reason: 'allZero' })
  })
  it('200 dòng ok, 201 dòng → tooMany', () => {
    const mk = (n: number) => makeDraft(Array.from({ length: n }, (_, i) => makeLine(i + 1)))
    expect(canSave(mk(200))).toEqual({ ok: true })
    expect(canSave(mk(201))).toEqual({ ok: false, reason: 'tooMany' })
  })
  it('hạn trước ngày phiếu → expiryBeforeDate kèm keys', () => {
    const d = makeDraft([
      makeLine(1, { expiryDate: '2026-11-03' }),
      makeLine(2, { expiryDate: '2026-11-04' }),
      makeLine(3, { expiryDate: '2026-01-01', quantity: 0 }),
    ])
    expect(canSave(d)).toEqual({ ok: false, reason: 'expiryBeforeDate', keys: ['m-1|u-1'] })
  })
  it('hạn bằng ngày phiếu → ok', () => {
    expect(canSave(makeDraft([makeLine(1, { expiryDate: '2026-11-04' })]))).toEqual({ ok: true })
  })
})

describe('isDirty', () => {
  const form = makeForm([makeItem(1), makeItem(2)])
  it('chưa sửa → false, dấu đã kiểm không tính', () => {
    const d = draftFromForm(form)
    d.lines[0].checked = true
    expect(isDirty(d, form)).toBe(false)
  })
  it('sửa số / hạn / ghi chú → true', () => {
    for (const patch of [{ quantity: 9 }, { expiryDate: '2027-01-01' }, { note: 'a' }]) {
      const d = draftFromForm(form)
      Object.assign(d.lines[1], patch)
      expect(isDirty(d, form)).toBe(true)
    }
  })
  it('chênh dưới 6 chữ số không tính; ghi chú rỗng = null', () => {
    const d = draftFromForm(form)
    d.lines[0].quantity = 10.0000001
    d.lines[0].note = ''
    expect(isDirty(d, form)).toBe(false)
  })
  it('có dòng thêm trên máy → true', () => {
    const d = draftFromForm(form)
    d.lines.push(makeLine(9, { base: null }))
    expect(isDirty(d, form)).toBe(true)
  })
})

describe('canSave — màn soạn (zeroIsMissing)', () => {
  it('canSave zeroIsMissing flags zero-quantity lines as missingQuantity', () => {
    const d = makeDraft([makeLine(1), makeLine(2, { quantity: 0 }), makeLine(3, { quantity: -1 })])
    expect(canSave(d, { zeroIsMissing: true })).toEqual({
      ok: false,
      reason: 'missingQuantity',
      keys: ['m-2|u-2', 'm-3|u-3'],
    })
    expect(canSave(makeDraft([]), { zeroIsMissing: true })).toEqual({
      ok: false,
      reason: 'noLines',
    })
    expect(canSave(makeDraft([makeLine(1)]), { zeroIsMissing: true })).toEqual({ ok: true })
  })

  it('canSave default still drops zero lines', () => {
    expect(canSave(makeDraft([makeLine(1), makeLine(2, { quantity: 0 })]))).toEqual({ ok: true })
    expect(canSave(makeDraft([makeLine(1, { quantity: 0 })]))).toEqual({
      ok: false,
      reason: 'allZero',
    })
  })
})

describe('hasEdits', () => {
  const form = makeForm([makeItem(1), makeItem(2)])
  it('bản dựng từ phiếu → false', () => {
    expect(hasEdits(draftFromForm(form))).toBe(false)
  })
  it('hasEdits true when only header changed', () => {
    const d = draftFromForm(form)
    d.header = { ...d.header, purchaseOrder: 'PO-9' }
    expect(hasEdits(d)).toBe(true)
    // PO / ghi chú rỗng và null là một.
    d.header = { ...d.header, purchaseOrder: '  ' }
    expect(hasEdits(d)).toBe(false)
  })
  it('đổi đơn giá hoặc đơn vị → true', () => {
    const price = draftFromForm(form)
    price.lines[0]!.unitPrice = 1500
    expect(hasEdits(price)).toBe(true)
    const unit = draftFromForm(form)
    unit.lines[0]!.unitSlug = 'u-x'
    expect(hasEdits(unit)).toBe(true)
  })
})

describe('baseKey', () => {
  it('khoá theo đơn vị lúc tải; dòng thêm trên máy = khoá hiện tại', () => {
    expect(
      baseKey(makeLine(1, { key: 'm-1|u-x', unitSlug: 'u-x', base: { unitSlug: 'u-1' } })),
    ).toBe('m-1|u-1')
    expect(baseKey(makeLine(9, { base: null }))).toBe('m-9|u-9')
  })
})

describe('isDirty — đầu phiếu, giá, đơn vị', () => {
  const form = makeForm([makeItem(1)])
  it('đầu phiếu / giá / đơn vị khác phiếu → true', () => {
    const header = draftFromForm(form)
    header.header = { ...header.header, note: 'x' }
    expect(isDirty(header, form)).toBe(true)
    const price = draftFromForm(form)
    price.lines[0]!.unitPrice = 2000
    expect(isDirty(price, form)).toBe(true)
  })
  it('phiếu thiếu trường PO / ghi chú (vắng trong phản hồi) coi như null, không lỗi', () => {
    const sparse = makeForm([makeItem(1)], { purchaseOrder: undefined, note: undefined } as never)
    expect(isDirty(draftFromForm(sparse), sparse)).toBe(false)
  })
})

describe('file đính kèm', () => {
  const URL_A = 'https://b.s3.amazonaws.com/import-forms/a-1731000000000.pdf'
  const URL_B = 'https://b.s3.amazonaws.com/import-forms/b-1731000000001.pdf'
  const withFile = (file: string | null, baseFile: string | null) => {
    const header = makeDraft([makeLine(1)]).header
    return makeDraft([makeLine(1)], {
      header: { ...header, file },
      headerBase: { ...header, file: baseFile },
    })
  }

  it('headerFromForm lấy form.file', () => {
    expect(headerFromForm(makeForm([makeItem(1)], { file: URL_A })).file).toBe(URL_A)
    expect(headerFromForm(makeForm([makeItem(1)])).file).toBeNull()
  })

  it('toUpdateInput: không đổi file thì KHÔNG có key file (kể cả base có URL)', () => {
    expect(toUpdateInput(withFile(null, null))).not.toHaveProperty('file')
    expect(toUpdateInput(withFile(URL_A, URL_A))).not.toHaveProperty('file')
  })
  it('toUpdateInput: đổi URL gửi URL; gỡ gửi chuỗi rỗng', () => {
    expect(toUpdateInput(withFile(URL_B, URL_A)).file).toBe(URL_B)
    expect(toUpdateInput(withFile(URL_A, null)).file).toBe(URL_A)
    expect(toUpdateInput(withFile(null, URL_A)).file).toBe('')
  })
  it('toCreateInput: có file gửi, null bỏ key', () => {
    expect(toCreateInput(withFile(URL_A, null)).file).toBe(URL_A)
    expect(toCreateInput(withFile(null, null))).not.toHaveProperty('file')
  })
  it('hasEdits true khi chỉ đổi file', () => {
    expect(hasEdits(withFile(URL_A, null))).toBe(true)
    expect(hasEdits(withFile(null, URL_A))).toBe(true)
    expect(hasEdits(withFile(URL_A, URL_A))).toBe(false)
  })
  it('isDirty true khi chỉ đổi file so với phiếu', () => {
    const form = makeForm([makeItem(1)], { file: URL_A })
    expect(isDirty(withFile(URL_B, URL_A), form)).toBe(true)
    expect(isDirty(withFile(URL_A, URL_A), form)).toBe(false)
  })
})

describe('headerFromForm — chuẩn hoá file (m1)', () => {
  it("file '' hoặc vắng trong phản hồi → header.file null, không làm bản nháp dirty", () => {
    const empty = makeForm([makeItem(1)], { file: '' })
    const { file: _omit, ...rest } = makeForm([makeItem(1)])
    const sparse = rest as unknown as typeof empty
    for (const form of [empty, sparse]) {
      expect(headerFromForm(form).file).toBeNull()
      const d = draftFromForm(form)
      expect(d.header.file).toBeNull()
      expect(d.headerBase?.file).toBeNull()
      expect(isDirty(d, form)).toBe(false)
    }
  })
})
