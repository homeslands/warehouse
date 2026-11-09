import { draftFromForm } from './draft'
import { makeDraft, makeForm, makeItem, makeLine } from './fixtures'
import { mergeAfterConflict } from './merge'

const b = (quantity: number, expiryDate: string | null = null, note: string | null = null) => ({
  quantity,
  expiryDate,
  note,
})

describe('mergeAfterConflict', () => {
  it('dòng không đổi trên server: giữ checked và số đã sửa', () => {
    const local = makeDraft([makeLine(1, { checked: true, quantity: 8 })])
    const fresh = makeForm([makeItem(1)], { version: 4 })
    const m = mergeAfterConflict(local, fresh).draft
    expect(m.lines[0]).toMatchObject({ checked: true, quantity: 8, changedOnServer: false })
    expect(m.version).toBe(4)
  })

  it('dòng server đổi số: base mới, bỏ checked, đánh dấu, lấy số mới nếu người dùng chưa sửa', () => {
    const local = makeDraft([makeLine(1, { checked: true })])
    const fresh = makeForm([makeItem(1, { quantity: 12 })])
    const l = mergeAfterConflict(local, fresh).draft.lines[0]
    expect(l).toMatchObject({ checked: false, changedOnServer: true, quantity: 12 })
    expect(l.base).toMatchObject(b(12))
  })

  it('dòng server đổi nhưng người dùng đã sửa số: giữ số đã gõ', () => {
    const local = makeDraft([makeLine(1, { checked: true, quantity: 8 })])
    const fresh = makeForm([makeItem(1, { quantity: 12 })])
    const l = mergeAfterConflict(local, fresh).draft.lines[0]
    expect(l).toMatchObject({ checked: false, changedOnServer: true, quantity: 8 })
    expect(l.base).toMatchObject(b(12))
  })

  it('server đổi hạn/ghi chú: bắt buộc kiểm lại; trường chưa sửa lấy giá trị mới', () => {
    const local = makeDraft([makeLine(1, { checked: true, note: 'của tôi', base: b(10) })])
    const fresh = makeForm([makeItem(1, { expiryDate: '2027-02-02', note: 'kế toán' })])
    const l = mergeAfterConflict(local, fresh).draft.lines[0]
    expect(l).toMatchObject({
      checked: false,
      changedOnServer: true,
      expiryDate: '2027-02-02',
      note: 'của tôi',
    })
  })

  it('dòng server xoá thì bỏ; dòng server thêm là unchecked', () => {
    const local = makeDraft([makeLine(1, { checked: true }), makeLine(2, { checked: true })])
    const fresh = makeForm([makeItem(2), makeItem(3)])
    const m = mergeAfterConflict(local, fresh).draft
    expect(m.lines.map((l) => l.key)).toEqual(['m-2|u-2', 'm-3|u-3'])
    expect(m.lines[0].checked).toBe(true)
    expect(m.lines[1]).toMatchObject({ checked: false, changedOnServer: false })
  })

  it('dòng thêm trên máy giữ nguyên, nằm cuối', () => {
    const local = makeDraft([makeLine(1), makeLine(9, { base: null, checked: true, quantity: 4 })])
    const m = mergeAfterConflict(local, makeForm([makeItem(1), makeItem(2)])).draft
    expect(m.lines.map((l) => l.key)).toEqual(['m-1|u-1', 'm-2|u-2', 'm-9|u-9'])
    expect(m.lines[2]).toMatchObject({ base: null, checked: true, quantity: 4 })
  })

  it('server đã có cùng key với dòng thêm trên máy: nhập vào dòng server', () => {
    const local = makeDraft([makeLine(5, { base: null, checked: true, quantity: 4, note: 'n' })])
    const fresh = makeForm([makeItem(5, { quantity: 7 })])
    const m = mergeAfterConflict(local, fresh).draft
    expect(m.lines).toHaveLength(1)
    expect(m.lines[0]).toMatchObject({
      changedOnServer: true,
      checked: false,
      quantity: 4,
      note: 'n',
    })
    expect(m.lines[0].base).toMatchObject(b(7))
  })

  it('version, formSlug, header lấy từ fresh', () => {
    const local = makeDraft([makeLine(1)], { version: 3 })
    const fresh = makeForm([makeItem(1, { supplierSlug: 's9' })], {
      version: 7,
      invoiceCode: 'HD-NEW',
      date: '2026-11-05',
    })
    const m = mergeAfterConflict(local, fresh).draft
    expect(m.version).toBe(7)
    expect(m.header).toEqual(draftFromForm(fresh).header)
    expect(m.headerBase).toEqual(draftFromForm(fresh).header)
    expect(m.header.invoiceCode).toBe('HD-NEW')
    expect(m.header.supplierSlug).toBe('s9')
  })

  describe('server đổi về đúng giá trị người dùng đang có (vd PATCH đã ghi nhưng mất phản hồi)', () => {
    it('số server = số đã sửa → vẫn checked, không đánh dấu, base = server', () => {
      const local = makeDraft([makeLine(1, { checked: true, quantity: 8 })])
      const fresh = makeForm([makeItem(1, { quantity: 8 })], { version: 4 })
      const l = mergeAfterConflict(local, fresh).draft.lines[0]
      expect(l).toMatchObject({ checked: true, changedOnServer: false, quantity: 8 })
      expect(l.base).toMatchObject(b(8))
    })

    it('số + hạn + ghi chú server đều = bản trên máy → vẫn checked, base = server', () => {
      const local = makeDraft([
        makeLine(1, { checked: true, quantity: 8, expiryDate: '2027-01-01', note: 'móp' }),
      ])
      const fresh = makeForm([makeItem(1, { quantity: 8, expiryDate: '2027-01-01', note: 'móp' })])
      const l = mergeAfterConflict(local, fresh).draft.lines[0]
      expect(l).toMatchObject({ checked: true, changedOnServer: false })
      expect(l.base).toMatchObject(b(8, '2027-01-01', 'móp'))
    })

    it('số server = số đã sửa nhưng server đổi hạn khác bản trên máy → đánh dấu, giữ số đã sửa', () => {
      const local = makeDraft([makeLine(1, { checked: true, quantity: 8 })])
      const fresh = makeForm([makeItem(1, { quantity: 8, expiryDate: '2027-03-03' })])
      const l = mergeAfterConflict(local, fresh).draft.lines[0]
      expect(l).toMatchObject({
        checked: false,
        changedOnServer: true,
        quantity: 8,
        expiryDate: '2027-03-03',
      })
      expect(l.base).toMatchObject(b(8, '2027-03-03'))
    })

    it('số server khác số đã sửa → đánh dấu, giữ số đã gõ (luật cũ)', () => {
      const local = makeDraft([makeLine(1, { checked: true, quantity: 8 })])
      const fresh = makeForm([makeItem(1, { quantity: 9 })])
      const l = mergeAfterConflict(local, fresh).draft.lines[0]
      expect(l).toMatchObject({ checked: false, changedOnServer: true, quantity: 8 })
      expect(l.base).toMatchObject(b(9))
    })

    it('dòng thêm trên máy mà server đã có đúng giá trị đó → thành dòng server, vẫn checked', () => {
      const local = makeDraft([makeLine(5, { base: null, checked: true, quantity: 4 })])
      const fresh = makeForm([makeItem(5, { quantity: 4 })])
      const m = mergeAfterConflict(local, fresh).draft
      expect(m.lines).toHaveLength(1)
      expect(m.lines[0]).toMatchObject({ checked: true, changedOnServer: false, quantity: 4 })
      expect(m.lines[0].base).toMatchObject(b(4))
    })

    it('ghi chú rỗng và null là một', () => {
      const local = makeDraft([makeLine(1, { checked: true, quantity: 8, note: '  ' })])
      const fresh = makeForm([makeItem(1, { quantity: 8, note: null })])
      expect(mergeAfterConflict(local, fresh).draft.lines[0]).toMatchObject({
        checked: true,
        changedOnServer: false,
      })
    })
  })
})

describe('mergeAfterConflict — đầu phiếu, đơn giá, đơn vị', () => {
  const header = makeDraft([]).header

  it('header field edited locally survives when server did not change it', () => {
    const local = makeDraft([makeLine(1)], {
      header: { ...header, note: 'của tôi', purchaseOrder: 'PO-1' },
      headerBase: header,
    })
    const r = mergeAfterConflict(local, makeForm([makeItem(1)], { version: 4 }))
    expect(r.draft.header).toMatchObject({ note: 'của tôi', purchaseOrder: 'PO-1' })
    expect(r.draft.headerBase).toEqual(header)
    expect(r.headerConflicts).toEqual([])
    // Server đổi đúng giá trị trên máy → đã khớp, không phải xung đột.
    const same = mergeAfterConflict(local, makeForm([makeItem(1)], { note: 'của tôi' }))
    expect(same.draft.header.note).toBe('của tôi')
    expect(same.headerConflicts).toEqual([])
  })

  it('header field changed on both sides → server wins, listed in headerConflicts', () => {
    const local = makeDraft([makeLine(1)], {
      header: { ...header, invoiceCode: 'HD-MAY', date: '2026-11-05', note: 'n' },
      headerBase: header,
    })
    const fresh = makeForm([makeItem(1, { supplierSlug: 's9' })], {
      version: 4,
      invoiceCode: 'HD-WEB',
      date: '2026-11-06',
    })
    const r = mergeAfterConflict(local, fresh)
    expect(r.draft.header).toEqual({
      code: 'PN-1',
      invoiceCode: 'HD-WEB',
      date: '2026-11-06',
      purchaseOrder: null,
      note: 'n',
      supplierSlug: 's9',
      file: null,
    })
    expect(r.headerConflicts).toEqual(['invoiceCode', 'date'])
  })

  it('không có headerBase (bản lưu cũ / phiếu mới) → lấy hết đầu phiếu của server', () => {
    const local = makeDraft([makeLine(1)], {
      header: { ...header, note: 'của tôi' },
      headerBase: null,
    })
    const r = mergeAfterConflict(local, makeForm([makeItem(1)]))
    expect(r.draft.header.note).toBeNull()
    expect(r.headerConflicts).toEqual([])
  })

  it('price edited locally kept; price conflict marks changedOnServer', () => {
    const local = makeDraft([
      makeLine(1, { checked: true, unitPrice: 1500, base: { unitPrice: 1000 } }),
      makeLine(2, { checked: true, unitPrice: 1500, base: { unitPrice: 1000 } }),
      makeLine(3, { checked: true }),
    ])
    const fresh = makeForm([
      makeItem(1),
      makeItem(2, { unitPrice: 1200 }),
      makeItem(3, { unitPrice: 1300 }),
    ])
    const [l1, l2, l3] = mergeAfterConflict(local, fresh).draft.lines
    // Server không đổi giá → giữ giá đã sửa, vẫn đã kiểm.
    expect(l1).toMatchObject({ unitPrice: 1500, checked: true, changedOnServer: false })
    expect(l1!.base).toMatchObject({ unitPrice: 1000 })
    // Cả hai đổi khác nhau → xung đột, giữ giá đã gõ.
    expect(l2).toMatchObject({ unitPrice: 1500, checked: false, changedOnServer: true })
    expect(l2!.base).toMatchObject({ unitPrice: 1200 })
    // Server đổi, máy chưa sửa → lấy giá mới, kiểm lại.
    expect(l3).toMatchObject({ unitPrice: 1300, checked: false, changedOnServer: true })
  })

  it('unit changed locally still matches its server line by base unit', () => {
    const units = [
      { unitSlug: 'u-1', unitCode: 'B', unitName: 'bao', conversionRate: 1, isBaseUnit: true },
      { unitSlug: 'u-x', unitCode: 'T', unitName: 'thùng', conversionRate: 24, isBaseUnit: false },
    ]
    const local = makeDraft([
      makeLine(1, {
        key: 'm-1|u-x',
        unitSlug: 'u-x',
        unitName: 'thùng',
        units,
        quantity: 2,
        checked: true,
        base: { unitSlug: 'u-1' },
      }),
    ])
    const r = mergeAfterConflict(local, makeForm([makeItem(1)], { version: 4 }))
    expect(r.removed).toEqual([])
    expect(r.draft.lines).toHaveLength(1)
    expect(r.draft.lines[0]).toMatchObject({
      key: 'm-1|u-x',
      unitSlug: 'u-x',
      unitName: 'thùng',
      units,
      quantity: 2,
      checked: true,
      changedOnServer: false,
    })
    expect(r.draft.lines[0]!.base).toMatchObject({ unitSlug: 'u-1', quantity: 10 })
  })

  it('đổi đơn vị sang đúng dòng server vừa thêm → về đơn vị lúc tải, kiểm lại (khoá không trùng)', () => {
    const local = makeDraft([
      makeLine(1, {
        key: 'm-1|u-x',
        unitSlug: 'u-x',
        unitName: 'thùng',
        checked: true,
        base: { unitSlug: 'u-1' },
      }),
    ])
    const fresh = makeForm([
      makeItem(1),
      makeItem(2, { materialSlug: 'm-1', unitSlug: 'u-x', unitName: 'thùng' }),
    ])
    const r = mergeAfterConflict(local, fresh)
    expect(r.draft.lines.map((l) => l.key)).toEqual(['m-1|u-1', 'm-1|u-x'])
    expect(r.draft.lines[0]).toMatchObject({
      unitSlug: 'u-1',
      unitName: 'bao',
      checked: false,
      changedOnServer: true,
    })
    expect(r.removed).toEqual([])
  })

  it('removed: dòng trên máy (có base) không còn trên server', () => {
    const local = makeDraft([makeLine(1), makeLine(2), makeLine(9, { base: null })])
    expect(mergeAfterConflict(local, makeForm([makeItem(1)])).removed).toEqual(['Vật tư 2'])
  })
})

describe('mergeAfterConflict — file đính kèm', () => {
  const A = 'https://h/a-1731000000000.pdf'
  const B = 'https://h/b-1731000000001.pdf'
  const C = 'https://h/c-1731000000002.pdf'
  const header = makeDraft([]).header
  const local = (file: string | null, baseFile: string | null) =>
    makeDraft([makeLine(1)], {
      header: { ...header, file },
      headerBase: { ...header, file: baseFile },
    })
  const server = (file: string | null) => makeForm([makeItem(1)], { version: 4, file })

  it('mình đổi file, server giữ → giữ của mình', () => {
    const r = mergeAfterConflict(local(B, A), server(A))
    expect(r.draft.header.file).toBe(B)
    expect(r.headerConflicts).toEqual([])
  })
  it('mình gỡ file, server giữ → giữ của mình (null)', () => {
    expect(mergeAfterConflict(local(null, A), server(A)).draft.header.file).toBeNull()
  })
  it('mình không đổi, server đổi → nhận của server', () => {
    const r = mergeAfterConflict(local(A, A), server(B))
    expect(r.draft.header.file).toBe(B)
    expect(r.draft.headerBase!.file).toBe(B)
  })
  it('hai bên cùng đổi khác nhau → theo server, ghi vào headerConflicts', () => {
    const r = mergeAfterConflict(local(B, A), server(C))
    expect(r.draft.header.file).toBe(C)
    expect(r.headerConflicts).toContain('file')
  })
})
