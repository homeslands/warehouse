import {
  baseKey,
  canSave,
  draftFromForm,
  exportLineKey,
  hasEdits,
  headerFromForm,
  isDirty,
  linesTotal,
  MAX_ITEMS,
  newExportDraft,
  toInput,
} from './draft'
import { makeDraft, makeForm, makeItem, makeLine } from './fixtures'

describe('exportLineKey', () => {
  it('khoá theo vật tư + đơn vị + lô; lô tự động là chuỗi rỗng', () => {
    expect(exportLineKey({ materialSlug: 'm', unitSlug: 'u', batchSlug: null })).toBe('m|u|')
    expect(exportLineKey({ materialSlug: 'm', unitSlug: 'u', batchSlug: 'b' })).toBe('m|u|b')
  })

  it('cùng vật tư + đơn vị nhưng khác lô là hai khoá', () => {
    const a = exportLineKey({ materialSlug: 'm', unitSlug: 'u', batchSlug: 'b1' })
    const b = exportLineKey({ materialSlug: 'm', unitSlug: 'u', batchSlug: 'b2' })
    expect(a).not.toBe(b)
  })
})

describe('draftFromForm / isDirty / hasEdits', () => {
  const form = makeForm([
    makeItem(2, { batchSlug: 'b', batchExpiryDate: '2027-01-01' }),
    makeItem(1),
  ])

  it('dựng từ phiếu theo lineNo, base = số trên phiếu', () => {
    const d = draftFromForm(form)
    expect(d.version).toBe(3)
    expect(d.header).toMatchObject({ code: 'PX-1', receiver: 'Bếp A', purchaseOrder: 'PO-1' })
    expect(d.lines.map((l) => l.key)).toEqual(['m-1|u-1|', 'm-2|u-2|b'])
    expect(d.lines[1]).toMatchObject({ batchSlug: 'b', batchExpiryDate: '2027-01-01' })
    expect(d.lines[1]!.base).toEqual({
      unitSlug: 'u-2',
      quantity: 10,
      unitPrice: 1000,
      batchSlug: 'b',
      note: null,
    })
  })

  it('đổi đơn vị trên máy: isDirty true, hasEdits true, baseKey vẫn là khoá đơn vị lúc tải', () => {
    const d = draftFromForm(form)
    const changed = {
      ...d,
      lines: d.lines.map((l, j) =>
        j === 0 ? { ...l, unitSlug: 'u-9', unitName: 'thùng', key: 'm-1|u-9|' } : l,
      ),
    }
    expect(isDirty(changed, form)).toBe(true)
    expect(hasEdits(changed)).toBe(true)
    expect(baseKey(changed.lines[0]!)).toBe('m-1|u-1|')
  })

  it('isDirty: không đổi → false; đổi số / giá / lô / ghi chú / đầu phiếu / thêm / bớt → true', () => {
    const d = draftFromForm(form)
    expect(isDirty(d, form)).toBe(false)
    const withLine = (i: number, patch: object) => ({
      ...d,
      lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    })
    expect(isDirty(withLine(0, { quantity: 9 }), form)).toBe(true)
    expect(isDirty(withLine(0, { unitPrice: 5 }), form)).toBe(true)
    expect(isDirty(withLine(0, { batchSlug: 'x', key: 'm-1|u-1|x' }), form)).toBe(true)
    expect(isDirty(withLine(0, { note: 'x' }), form)).toBe(true)
    expect(isDirty(withLine(0, { note: '  ' }), form)).toBe(false)
    expect(isDirty({ ...d, header: { ...d.header, receiver: 'B' } }, form)).toBe(true)
    expect(isDirty({ ...d, lines: d.lines.slice(1) }, form)).toBe(true)
    expect(isDirty({ ...d, lines: [...d.lines, makeLine(9, { base: null })] }, form)).toBe(true)
  })

  it('hasEdits: chỉ sửa thật so với base hoặc dòng thêm trên máy', () => {
    const d = draftFromForm(form)
    expect(hasEdits(d)).toBe(false)
    expect(hasEdits({ ...d, lines: [{ ...d.lines[0]!, quantity: 1 }] })).toBe(true)
    expect(hasEdits({ ...d, lines: [makeLine(9, { base: null })] })).toBe(true)
  })

  it('draftFromForm: headerBase = đầu phiếu lúc tải; phiếu mới không có headerBase', () => {
    expect(draftFromForm(form).headerBase).toEqual(draftFromForm(form).header)
    expect(newExportDraft().headerBase).toBeNull()
  })

  it('hasEdits tính cả đầu phiếu so với headerBase (chỉ sửa đầu phiếu cũng là có sửa)', () => {
    const d = draftFromForm(form)
    expect(hasEdits({ ...d, header: { ...d.header, type: 'DISPOSAL' } })).toBe(true)
    expect(hasEdits({ ...d, header: { ...d.header, note: '  ' } })).toBe(false)
    // Bản lưu cũ chưa có headerBase: không biết đầu phiếu lúc tải → không tính là sửa.
    const legacy = { ...d, header: { ...d.header, type: 'DISPOSAL' as const } }
    delete (legacy as { headerBase?: unknown }).headerBase
    expect(hasEdits(legacy)).toBe(false)
  })

  it('baseKey: khoá theo lô lúc tải, kể cả khi đã đổi lô trên máy', () => {
    const l = makeLine(1, {
      batchSlug: 'y',
      base: { unitSlug: 'u-1', quantity: 10, unitPrice: 1000, batchSlug: 'x', note: null },
    })
    expect(l.key).toBe('m-1|u-1|y')
    expect(baseKey(l)).toBe('m-1|u-1|x')
    expect(baseKey(makeLine(2, { base: null }))).toBe('m-2|u-2|')
  })
})

describe('canSave', () => {
  const ok = makeDraft([makeLine(1), makeLine(2)])

  it('hợp lệ', () => expect(canSave(ok)).toEqual({ ok: true }))

  it('noLines', () => expect(canSave(makeDraft([]))).toEqual({ ok: false, reason: 'noLines' }))

  it('tooMany', () => {
    const lines = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => makeLine(i))
    expect(canSave(makeDraft(lines))).toEqual({ ok: false, reason: 'tooMany' })
  })

  it('badQuantity: số 0, âm, NaN → nêu khoá dòng', () => {
    const d = makeDraft([makeLine(1, { quantity: 0 }), makeLine(2), makeLine(3, { quantity: NaN })])
    expect(canSave(d)).toEqual({
      ok: false,
      reason: 'badQuantity',
      keys: ['m-1|u-1|', 'm-3|u-3|'],
    })
    expect(canSave(makeDraft([makeLine(1, { quantity: -1 })])).ok).toBe(false)
    expect(canSave(makeDraft([makeLine(1, { quantity: 0.0000004 })])).ok).toBe(false)
  })

  it('missingPrice: giá trống (null) hoặc âm; 0 là hợp lệ', () => {
    const d = makeDraft([makeLine(1, { unitPrice: null }), makeLine(2, { unitPrice: 0 })])
    expect(canSave(d)).toEqual({ ok: false, reason: 'missingPrice', keys: ['m-1|u-1|'] })
    expect(canSave(makeDraft([makeLine(1, { unitPrice: -1 })])).ok).toBe(false)
    expect(canSave(makeDraft([makeLine(1, { unitPrice: 0 })])).ok).toBe(true)
  })

  it('duplicate: cùng vật tư + đơn vị + lô', () => {
    const d = makeDraft([makeLine(1), makeLine(1)])
    expect(canSave(d)).toEqual({ ok: false, reason: 'duplicate', keys: ['m-1|u-1|'] })
    // khác lô thì không trùng
    expect(canSave(makeDraft([makeLine(1), makeLine(1, { batchSlug: 'b' })])).ok).toBe(true)
  })
})

describe('toInput', () => {
  it('bỏ batchSlug null và ghi chú rỗng, đơn giá 2 số lẻ, số lượng 6 số lẻ', () => {
    const d = makeDraft([
      makeLine(1, { quantity: 1.23456789, unitPrice: 10.005 }),
      makeLine(2, { batchSlug: 'b', note: '  gấp  ' }),
      makeLine(3, { note: '   ' }),
    ])
    const input = toInput(d)
    expect(input.items[0]).toEqual({
      materialSlug: 'm-1',
      unitSlug: 'u-1',
      quantity: 1.234568,
      unitPrice: 10.01,
    })
    expect(input.items[0]).not.toHaveProperty('batchSlug')
    expect(input.items[0]).not.toHaveProperty('note')
    expect(input.items[1]).toMatchObject({ batchSlug: 'b', note: 'gấp' })
    expect(input.items[2]).not.toHaveProperty('note')
  })

  it('đầu phiếu: cắt khoảng trắng, bỏ HĐ / ghi chú rỗng', () => {
    const d = makeDraft([], {
      header: {
        code: ' PX-9 ',
        type: 'SALE',
        purchaseOrder: ' PO ',
        invoiceCode: '  ',
        receiver: ' An ',
        note: null,
        file: null,
      },
    })
    d.version = null
    const input = toInput(d)
    expect(input).toEqual({
      code: 'PX-9',
      type: 'SALE',
      purchaseOrder: 'PO',
      receiver: 'An',
      items: [],
    })
    expect(toInput(makeDraft([])).invoiceCode).toBe('HD-1')
  })

  it('phiếu mới (version null): bỏ HĐ / ghi chú rỗng', () => {
    const d = makeDraft([], { version: null })
    d.header.invoiceCode = null
    d.header.note = '  '
    const input = toInput(d)
    expect(input).not.toHaveProperty('invoiceCode')
    expect(input).not.toHaveProperty('note')
  })

  it('phiếu đã có trên server: xoá trắng HĐ / ghi chú gửi chuỗi rỗng (backend bỏ trường vắng)', () => {
    const d = makeDraft([], { version: 3 })
    d.header.invoiceCode = null
    d.header.note = '   '
    const input = toInput(d)
    expect(input.invoiceCode).toBe('')
    expect(input.note).toBe('')
  })
})

describe('linesTotal', () => {
  it('Σ round2(số × giá); giá trống tính 0', () => {
    const lines = [
      makeLine(1, { quantity: 3, unitPrice: 10.005 }),
      makeLine(2, { quantity: 2, unitPrice: null }),
      makeLine(3, { quantity: 0.5, unitPrice: 1001 }),
    ]
    expect(linesTotal(lines)).toBe(30.02 + 500.5)
    expect(linesTotal([])).toBe(0)
  })
})

describe('file đính kèm', () => {
  const URL_A = 'https://b.s3.amazonaws.com/export-forms/a-1731000000000.pdf'
  const URL_B = 'https://b.s3.amazonaws.com/export-forms/b-1731000000001.pdf'
  const withFile = (file: string | null, baseFile: string | null, version: number | null = 3) => {
    const header = makeDraft([]).header
    return makeDraft([makeLine(1)], {
      version,
      header: { ...header, file },
      headerBase: version === null ? null : { ...header, file: baseFile },
    })
  }

  it('headerFromForm lấy form.file; newExportDraft mặc định null', () => {
    expect(headerFromForm(makeForm([makeItem(1)], { file: URL_A })).file).toBe(URL_A)
    expect(newExportDraft().header.file).toBeNull()
  })
  it('phiếu đã có: không đổi file thì KHÔNG có key file', () => {
    expect(toInput(withFile(null, null))).not.toHaveProperty('file')
    expect(toInput(withFile(URL_A, URL_A))).not.toHaveProperty('file')
  })
  it('phiếu đã có: đổi URL gửi URL; gỡ gửi chuỗi rỗng', () => {
    expect(toInput(withFile(URL_B, URL_A)).file).toBe(URL_B)
    expect(toInput(withFile(URL_A, null)).file).toBe(URL_A)
    expect(toInput(withFile(null, URL_A)).file).toBe('')
  })
  it('phiếu mới: có file gửi, null bỏ key', () => {
    expect(toInput(withFile(URL_A, null, null)).file).toBe(URL_A)
    expect(toInput(withFile(null, null, null))).not.toHaveProperty('file')
  })
  it('hasEdits / isDirty true khi chỉ đổi file', () => {
    expect(hasEdits(withFile(URL_A, null))).toBe(true)
    expect(hasEdits(withFile(URL_A, URL_A))).toBe(false)
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
