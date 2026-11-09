import { draftFromForm, hasEdits } from './draft'
import { makeDraft, makeForm, makeItem, makeLine } from './fixtures'
import { mergeAfterConflict } from './merge'

const base = (
  quantity = 10,
  unitPrice: number | null = 1000,
  batchSlug: string | null = null,
  note: string | null = null,
) => ({ unitSlug: 'u-1', quantity, unitPrice, batchSlug, note })

describe('mergeAfterConflict', () => {
  it('dòng không đổi trên server: giữ số đã sửa, base = server, không đánh dấu', () => {
    const local = makeDraft([makeLine(1, { quantity: 8 })])
    const { draft } = mergeAfterConflict(local, makeForm([makeItem(1)], { version: 4 }))
    expect(draft.version).toBe(4)
    expect(draft.lines[0]).toMatchObject({ quantity: 8 })
    expect(draft.lines[0]!.changedOnServer).toBeUndefined()
    expect(draft.lines[0]!.base).toEqual(base())
  })

  it('server đổi trường người dùng chưa sửa: lấy giá trị mới, changedOnServer', () => {
    const local = makeDraft([makeLine(1)])
    const { draft } = mergeAfterConflict(local, makeForm([makeItem(1, { quantity: 12 })]))
    expect(draft.lines[0]).toMatchObject({ quantity: 12, changedOnServer: true })
    expect(draft.lines[0]!.base).toEqual(base(12))
  })

  it('server đổi trường khác giá trị người dùng đã gõ: xung đột, giữ số đã gõ', () => {
    const local = makeDraft([makeLine(1, { quantity: 8, note: 'của tôi' })])
    const fresh = makeForm([makeItem(1, { quantity: 12, unitPrice: 2000 })])
    const l = mergeAfterConflict(local, fresh).draft.lines[0]!
    expect(l).toMatchObject({
      quantity: 8,
      unitPrice: 2000,
      note: 'của tôi',
      changedOnServer: true,
    })
    expect(l.base).toEqual(base(12, 2000))
  })

  it('server đổi về đúng giá trị trên máy: đã khớp, không xung đột', () => {
    const local = makeDraft([makeLine(1, { quantity: 8, unitPrice: 1500 })])
    const fresh = makeForm([makeItem(1, { quantity: 8, unitPrice: 1500 })])
    const l = mergeAfterConflict(local, fresh).draft.lines[0]!
    expect(l.changedOnServer).toBeUndefined()
    expect(l).toMatchObject({ quantity: 8, unitPrice: 1500 })
    expect(l.base).toEqual(base(8, 1500))
  })

  it('xung đột cũ còn nguyên khi gộp lại mà không có đổi mới', () => {
    const local = makeDraft([makeLine(1, { changedOnServer: true })])
    const l = mergeAfterConflict(local, makeForm([makeItem(1)])).draft.lines[0]!
    expect(l.changedOnServer).toBe(true)
  })

  it('đổi lô trên máy vẫn là cùng dòng; server đổi lô → xung đột', () => {
    // Máy: lô tự động → b2 (khoá mới m-1|u-1|b2, base vẫn lô tự động).
    const local = makeDraft([
      makeLine(1, { batchSlug: 'b2', batchExpiryDate: '2027-02-02', key: 'm-1|u-1|b2' }),
    ])
    local.lines[0]!.base = base()
    const same = mergeAfterConflict(local, makeForm([makeItem(1)], { version: 4 })).draft
    expect(same.lines).toHaveLength(1)
    expect(same.lines[0]).toMatchObject({ batchSlug: 'b2', key: 'm-1|u-1|b2' })
    expect(same.lines[0]!.changedOnServer).toBeUndefined()
    expect(same.lines[0]!.base!.batchSlug).toBeNull()
    // Server đổi sang lô b3 (khác b2 trên máy): khoá server là m-1|u-1|b3 ≠ khoá lúc tải → dòng
    // server là dòng mới, dòng trên máy bị coi là bị xoá.
    const r = mergeAfterConflict(local, makeForm([makeItem(1, { batchSlug: 'b3' })]))
    expect(r.draft.lines.map((l) => l.key)).toEqual(['m-1|u-1|b3'])
    expect(r.removed).toEqual(['Vật tư 1'])
  })

  it('dòng bị xoá trên server → báo removed, không còn trong bản gộp', () => {
    const local = makeDraft([makeLine(1), makeLine(2)])
    const r = mergeAfterConflict(local, makeForm([makeItem(2), makeItem(3)]))
    expect(r.removed).toEqual(['Vật tư 1'])
    expect(r.draft.lines.map((l) => l.key)).toEqual(['m-2|u-2|', 'm-3|u-3|'])
    expect(r.draft.lines[1]!.changedOnServer).toBeUndefined()
  })

  it('dòng thêm trên máy giữ nguyên, nằm cuối, không bị báo removed', () => {
    const local = makeDraft([makeLine(1), makeLine(9, { base: null, quantity: 4 })])
    const r = mergeAfterConflict(local, makeForm([makeItem(1), makeItem(2)]))
    expect(r.draft.lines.map((l) => l.key)).toEqual(['m-1|u-1|', 'm-2|u-2|', 'm-9|u-9|'])
    expect(r.removed).toEqual([])
  })

  it('dòng thêm trên máy mà server đã có (khác giá trị) → một dòng, xung đột; giống → khớp', () => {
    const added = makeLine(1, { base: null, quantity: 4 })
    const r = mergeAfterConflict(makeDraft([added]), makeForm([makeItem(1)]))
    expect(r.draft.lines).toHaveLength(1)
    expect(r.draft.lines[0]).toMatchObject({ quantity: 4, changedOnServer: true })
    const same = mergeAfterConflict(
      makeDraft([makeLine(1, { base: null })]),
      makeForm([makeItem(1)]),
    )
    expect(same.draft.lines[0]!.changedOnServer).toBeUndefined()
  })

  it('đầu phiếu lấy của server', () => {
    const local = makeDraft([], {
      header: { ...draftFromForm(makeForm([])).header, receiver: 'Cũ' },
    })
    const r = mergeAfterConflict(local, makeForm([], { receiver: 'Mới' }))
    expect(r.draft.header.receiver).toBe('Mới')
  })

  describe('dòng đã đổi lô trên máy và dòng thêm trên máy cùng vật tư + đơn vị', () => {
    const relotted = () => {
      const a = makeLine(1, { batchSlug: 'b1', quantity: 6, key: 'm-1|u-1|b1' })
      a.base = base() // trên server là lô tự động
      return a
    }
    const added = () => makeLine(1, { base: null, quantity: 4 })

    it.each([
      ['[A, N]', (a: ReturnType<typeof relotted>, n: ReturnType<typeof added>) => [a, n]],
      ['[N, A]', (a: ReturnType<typeof relotted>, n: ReturnType<typeof added>) => [n, a]],
    ])('giữ cả hai dòng, không báo removed (%s)', (_name, order) => {
      const local = makeDraft(order(relotted(), added()))
      const r = mergeAfterConflict(local, makeForm([makeItem(1)], { version: 4 }))
      expect(r.removed).toEqual([])
      expect(r.draft.lines).toHaveLength(2)
      const a = r.draft.lines.find((l) => l.base !== null)!
      const n = r.draft.lines.find((l) => l.base === null)!
      expect(a).toMatchObject({ batchSlug: 'b1', quantity: 6, key: 'm-1|u-1|b1' })
      expect(n).toMatchObject({ quantity: 4, key: 'm-1|u-1|' })
    })
  })
})

describe('mergeAfterConflict: khoá dòng luôn duy nhất', () => {
  it('dòng đổi lô trên máy trùng khoá với dòng server mới → về lại lô trên server, changedOnServer', () => {
    const a = makeLine(1, {
      batchSlug: 'b1',
      batchExpiryDate: '2027-01-01',
      quantity: 6,
      key: 'm-1|u-1|b1',
    })
    a.base = base() // trên server là lô tự động
    const fresh = makeForm(
      [
        makeItem(1),
        makeItem(2, { materialSlug: 'm-1', unitSlug: 'u-1', batchSlug: 'b1', quantity: 3 }),
      ],
      { version: 4 },
    )
    const r = mergeAfterConflict(makeDraft([a]), fresh)
    const keys = r.draft.lines.map((l) => l.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(r.draft.lines).toHaveLength(2)
    expect(r.removed).toEqual([])
    const reverted = r.draft.lines.find((l) => l.key === 'm-1|u-1|')!
    expect(reverted).toMatchObject({
      quantity: 6,
      batchSlug: null,
      batchExpiryDate: null,
      changedOnServer: true,
    })
    expect(r.draft.lines.find((l) => l.key === 'm-1|u-1|b1')!.quantity).toBe(3)
  })
})

describe('mergeAfterConflict: đổi đơn vị trên máy', () => {
  const converted = () =>
    makeLine(1, {
      unitSlug: 'u-9',
      unitName: 'thùng',
      conversionRate: 12,
      quantity: 2,
      base: base(),
    })

  it('server không đổi → vẫn MỘT dòng (đơn vị mới), không removed, không dòng cũ hiện lại, không changedOnServer', () => {
    const r = mergeAfterConflict(makeDraft([converted()]), makeForm([makeItem(1)], { version: 4 }))
    expect(r.removed).toEqual([])
    expect(r.draft.lines).toHaveLength(1)
    expect(r.draft.lines[0]).toMatchObject({
      key: 'm-1|u-9|',
      unitSlug: 'u-9',
      unitName: 'thùng',
      conversionRate: 12,
      quantity: 2,
    })
    expect(r.draft.lines[0]!.base).toEqual(base())
    expect(r.draft.lines[0]!.changedOnServer).toBeUndefined()
  })

  it('server đổi dòng đó (số lượng) → changedOnServer, đơn vị đã đổi vẫn giữ', () => {
    const r = mergeAfterConflict(
      makeDraft([converted()]),
      makeForm([makeItem(1, { unitPrice: 2000 })], { version: 4 }),
    )
    expect(r.removed).toEqual([])
    expect(r.draft.lines).toHaveLength(1)
    expect(r.draft.lines[0]).toMatchObject({
      key: 'm-1|u-9|',
      unitSlug: 'u-9',
      conversionRate: 12,
      unitPrice: 2000,
      changedOnServer: true,
    })
  })

  it('server vừa thêm dòng đúng đơn vị mới → dòng về lại đơn vị trên server, changedOnServer, khoá duy nhất', () => {
    const fresh = makeForm(
      [makeItem(1), makeItem(2, { materialSlug: 'm-1', unitSlug: 'u-9', quantity: 3 })],
      { version: 4 },
    )
    const r = mergeAfterConflict(makeDraft([converted()]), fresh)
    expect(r.draft.lines.map((l) => l.key)).toEqual(['m-1|u-1|', 'm-1|u-9|'])
    expect(r.draft.lines[0]).toMatchObject({ unitSlug: 'u-1', changedOnServer: true })
  })
})

describe('mergeAfterConflict — đầu phiếu', () => {
  /** Bản nháp tải ở version 3 (đầu phiếu như `makeForm`), người dùng sửa đầu phiếu trên máy. */
  const edited = (patch: Partial<ReturnType<typeof makeDraft>['header']>) => {
    const d = draftFromForm(makeForm([makeItem(1)]))
    return { ...d, header: { ...d.header, ...patch } }
  }

  it('trường sửa trên máy mà server không đổi → giữ của máy; trường khác lấy server', () => {
    const local = edited({ type: 'DISPOSAL', receiver: 'Bếp B' })
    const r = mergeAfterConflict(
      local,
      makeForm([makeItem(1)], { version: 4, purchaseOrder: 'PO-2', receiver: 'Bếp B' }),
    )
    expect(r.draft.header).toMatchObject({
      type: 'DISPOSAL',
      receiver: 'Bếp B',
      purchaseOrder: 'PO-2',
    })
    expect(r.headerConflicts).toEqual([])
    // headerBase = đầu phiếu server → phần sửa trên máy vẫn là "có sửa".
    expect(r.draft.headerBase).toMatchObject({ type: 'PRODUCTION', purchaseOrder: 'PO-2' })
    expect(hasEdits(r.draft)).toBe(true)
  })

  it('server đổi trường người dùng đã sửa sang giá trị KHÁC → xung đột: lấy server, báo trường', () => {
    const local = edited({ type: 'DISPOSAL', invoiceCode: 'HD-9' })
    const r = mergeAfterConflict(
      local,
      makeForm([makeItem(1)], { version: 4, type: 'SALE', invoiceCode: 'HD-7' }),
    )
    expect(r.draft.header).toMatchObject({ type: 'SALE', invoiceCode: 'HD-7' })
    expect(r.headerConflicts).toEqual(['type', 'invoiceCode'])
  })

  it('server đổi đúng thành giá trị trên máy → không xung đột', () => {
    const r = mergeAfterConflict(
      edited({ receiver: 'Bếp B' }),
      makeForm([makeItem(1)], { version: 4, receiver: 'Bếp B' }),
    )
    expect(r.draft.header.receiver).toBe('Bếp B')
    expect(r.headerConflicts).toEqual([])
    expect(hasEdits(r.draft)).toBe(false)
  })

  it('không sửa đầu phiếu → lấy hết của server', () => {
    const r = mergeAfterConflict(
      edited({}),
      makeForm([makeItem(1)], { version: 4, type: 'SALE', note: 'mới' }),
    )
    expect(r.draft.header).toMatchObject({ type: 'SALE', note: 'mới' })
    expect(r.headerConflicts).toEqual([])
  })

  it('bản lưu cũ không có headerBase → đầu phiếu lấy của server, không báo', () => {
    const local = edited({ type: 'DISPOSAL' })
    delete (local as { headerBase?: unknown }).headerBase
    const r = mergeAfterConflict(local, makeForm([makeItem(1)], { version: 4, type: 'SALE' }))
    expect(r.draft.header.type).toBe('SALE')
    expect(r.headerConflicts).toEqual([])
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
