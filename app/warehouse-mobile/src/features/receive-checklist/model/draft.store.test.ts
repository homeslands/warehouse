import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'

import { kv } from '@/shared/storage/kv'

import { newDraft } from './add-line'
import { draftFromForm, toUpdateInput, type ReceiveDraft } from './draft'
import {
  draftStorageKey,
  isValidDraft,
  stopDraftPersistence,
  useReceiveDraft,
  type DraftContext,
} from './draft.store'
import { makeDraft, makeForm, makeItem, makeLine } from './fixtures'

const ctx: DraftContext = { userSlug: 'u1', warehouseSlug: 'wh1', formSlug: 'pn-1' }
const key = draftStorageKey(ctx.userSlug, ctx.warehouseSlug, ctx.formSlug)
const form = (version = 3) => makeForm([makeItem(1), makeItem(2)], { slug: 'pn-1', version })

type Listener = (s: string) => void
let listeners: Listener[]

beforeEach(async () => {
  jest.useFakeTimers()
  await AsyncStorage.clear()
  listeners = []
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, l: Listener) => {
    listeners.push(l)
    return { remove: jest.fn() }
  }) as never)
  jest.mocked(AppState.addEventListener).mockClear()
  useReceiveDraft.getState().reset()
})

afterEach(async () => {
  stopDraftPersistence()
  jest.restoreAllMocks()
  jest.useRealTimers()
})

const settle = () => jest.advanceTimersByTimeAsync(400)

describe('draftStorageKey', () => {
  it('ghép theo user, kho, phiếu', () => {
    expect(draftStorageKey('u', 'w', 'new')).toBe('warehouse.receiveDraft.u.w.new')
  })
})

describe('useReceiveDraft', () => {
  it('load không có bản lưu → draftFromForm', async () => {
    await useReceiveDraft.getState().load(ctx, form())
    const d = useReceiveDraft.getState().draft!
    expect(d.lines).toHaveLength(2)
    expect(d.lines.every((l) => !l.checked)).toBe(true)
  })

  it('toggle rồi load lại cùng ctx → còn dấu đã kiểm', async () => {
    await useReceiveDraft.getState().load(ctx, form())
    useReceiveDraft.getState().toggleCheck('m-1|u-1')
    await settle()
    useReceiveDraft.getState().reset()
    await useReceiveDraft.getState().load(ctx, form())
    const lines = useReceiveDraft.getState().draft!.lines
    expect(lines.find((l) => l.key === 'm-1|u-1')!.checked).toBe(true)
    expect(lines.find((l) => l.key === 'm-2|u-2')!.checked).toBe(false)
  })

  it('khoá khác user hoặc kho → không thấy bản lưu', async () => {
    await useReceiveDraft.getState().load(ctx, form())
    useReceiveDraft.getState().toggleCheck('m-1|u-1')
    await settle()
    for (const other of [
      { ...ctx, userSlug: 'u2' },
      { ...ctx, warehouseSlug: 'wh2' },
    ]) {
      useReceiveDraft.getState().reset()
      await useReceiveDraft.getState().load(other, form())
      expect(useReceiveDraft.getState().draft!.lines.some((l) => l.checked)).toBe(false)
    }
  })

  it('debounce 300ms: chưa ghi trước hạn, một lần ghi sau hạn', async () => {
    await useReceiveDraft.getState().load(ctx, form())
    const set = jest.spyOn(kv, 'set')
    useReceiveDraft.getState().toggleCheck('m-1|u-1')
    useReceiveDraft.getState().toggleCheck('m-2|u-2')
    await jest.advanceTimersByTimeAsync(299)
    expect(set).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(2)
    expect(set).toHaveBeenCalledTimes(1)
  })

  it('bản lưu version 3, server version 4 → mergeAfterConflict, dòng đổi có changedOnServer', async () => {
    await useReceiveDraft.getState().load(ctx, form(3))
    useReceiveDraft.getState().toggleCheck('m-1|u-1')
    useReceiveDraft.getState().toggleCheck('m-2|u-2')
    await settle()
    useReceiveDraft.getState().reset()
    const fresh = makeForm([makeItem(1), makeItem(2, { quantity: 99 })], {
      slug: 'pn-1',
      version: 4,
    })
    await useReceiveDraft.getState().load(ctx, fresh)
    const d = useReceiveDraft.getState().draft!
    expect(d.version).toBe(4)
    const l1 = d.lines.find((l) => l.key === 'm-1|u-1')!
    const l2 = d.lines.find((l) => l.key === 'm-2|u-2')!
    expect(l1).toMatchObject({ checked: true, changedOnServer: false })
    expect(l2).toMatchObject({ checked: false, changedOnServer: true, quantity: 99 })
  })

  it('load báo kết quả: có bản lưu trên máy? đã gộp vì version đổi? dòng nào bị xoá trên server?', async () => {
    // Không có bản lưu.
    expect(await useReceiveDraft.getState().load(ctx, form(3))).toEqual({
      local: false,
      edited: false,
      merged: false,
      removed: [],
      headerConflicts: [],
    })
    useReceiveDraft.getState().toggleCheck('m-1|u-1')
    await settle()
    useReceiveDraft.getState().reset()
    // Có bản lưu, cùng version → khôi phục, không gộp.
    expect(await useReceiveDraft.getState().load(ctx, form(3))).toEqual({
      local: true,
      edited: false,
      merged: false,
      removed: [],
      headerConflicts: [],
    })
    // Server v4: dòng 2 bị xoá → gộp, nêu tên dòng bị xoá.
    const fresh = makeForm([makeItem(1)], { slug: 'pn-1', version: 4 })
    expect(await useReceiveDraft.getState().load(ctx, fresh)).toEqual({
      local: true,
      edited: false,
      merged: true,
      removed: ['Vật tư 2'],
      headerConflicts: [],
    })
  })

  it('load báo `edited` khi bản lưu có sửa thật (số / hạn / ghi chú / dòng thêm), không tính dấu kiểm', async () => {
    await useReceiveDraft.getState().load(ctx, form(3))
    // Dấu kiểm đơn thuần (vd còn lại sau Lưu ở chế độ sửa phiếu) → không phải sửa thật.
    useReceiveDraft.getState().toggleCheck('m-1|u-1')
    await settle()
    useReceiveDraft.getState().reset()
    expect((await useReceiveDraft.getState().load(ctx, form(4))).edited).toBe(false)
    // Sửa số → sửa thật, kể cả khi version đổi (gộp).
    useReceiveDraft.getState().updateLine('m-2|u-2', { quantity: 7 })
    await settle()
    useReceiveDraft.getState().reset()
    expect(await useReceiveDraft.getState().load(ctx, form(5))).toMatchObject({
      local: true,
      edited: true,
      merged: true,
    })
    // Dòng thêm trên máy cũng là sửa thật.
    const added: ReceiveDraft = { ...draftFromForm(form(5)), savedAt: 1 }
    added.lines = [...added.lines, { ...added.lines[0]!, key: 'm-9|u-9', base: null }]
    await kv.set(key, added)
    useReceiveDraft.getState().reset()
    expect((await useReceiveDraft.getState().load(ctx, form(5))).edited).toBe(true)
  })

  it('updateLine đặt checked=true; setHeader, addLine, replace ghi lại', async () => {
    await useReceiveDraft.getState().load(ctx, form())
    const s = useReceiveDraft.getState()
    s.updateLine('m-1|u-1', { quantity: 7, note: 'x' })
    const l = useReceiveDraft.getState().draft!.lines[0]
    expect(l).toMatchObject({ quantity: 7, note: 'x', checked: true })
    s.setHeader({ invoiceCode: 'HD-9' })
    expect(useReceiveDraft.getState().draft!.header.invoiceCode).toBe('HD-9')
    s.addLine({ ...l, key: 'm-9|u-9', materialSlug: 'm-9', unitSlug: 'u-9', base: null })
    expect(useReceiveDraft.getState().draft!.lines).toHaveLength(3)
    await settle()
    const saved = await kv.get<ReceiveDraft>(key)
    expect(saved!.lines).toHaveLength(3)
    s.replace({ ...saved!, lines: [] })
    expect(useReceiveDraft.getState().draft!.lines).toHaveLength(0)
  })

  it('discard xoá khoá và bản nháp, kể cả ghi đang chờ', async () => {
    await useReceiveDraft.getState().load(ctx, form())
    useReceiveDraft.getState().toggleCheck('m-1|u-1')
    await useReceiveDraft.getState().discard()
    await settle()
    expect(await AsyncStorage.getItem(key)).toBeNull()
    expect(useReceiveDraft.getState().draft).toBeNull()
  })

  it('adoptServerForm từ new: xoá khoá new, ghi khoá slug mới, giữ dấu kiểm, rebase base', async () => {
    const newCtx: DraftContext = { ...ctx, formSlug: 'new' }
    await useReceiveDraft.getState().load(newCtx, null)
    expect(useReceiveDraft.getState().draft).toBeNull()
    const base = draftFromForm(form())
    useReceiveDraft.getState().replace({
      ...base,
      formSlug: 'new',
      version: null,
      lines: [
        { ...base.lines[0], checked: true },
        { ...base.lines[1], base: null, quantity: 5, checked: true, changedOnServer: true },
      ],
    })
    await settle()
    expect(await AsyncStorage.getItem(draftStorageKey('u1', 'wh1', 'new'))).not.toBeNull()

    const saved = makeForm([makeItem(1), makeItem(2, { quantity: 5 })], {
      slug: 'pn-7',
      version: 1,
    })
    useReceiveDraft.getState().adoptServerForm(saved)
    await settle()
    expect(await AsyncStorage.getItem(draftStorageKey('u1', 'wh1', 'new'))).toBeNull()
    const stored = await kv.get<ReceiveDraft>(draftStorageKey('u1', 'wh1', 'pn-7'))
    expect(stored).toMatchObject({ formSlug: 'pn-7', version: 1 })
    const [a, b] = stored!.lines
    expect(a.checked).toBe(true)
    expect(b).toMatchObject({ checked: true, changedOnServer: false })
    expect(b.base).toMatchObject({ quantity: 5, expiryDate: null, note: null })
    expect(useReceiveDraft.getState().ctx?.formSlug).toBe('pn-7')
  })

  it('adoptServerForm xoá changedOnServer của dòng cũ', async () => {
    await useReceiveDraft.getState().load(ctx, form(3))
    useReceiveDraft.getState().toggleCheck('m-1|u-1')
    useReceiveDraft.getState().adoptServerForm(form(4))
    const d = useReceiveDraft.getState().draft!
    expect(d.version).toBe(4)
    expect(d.lines[0].checked).toBe(true)
    expect(d.lines.every((l) => !l.changedOnServer)).toBe(true)
  })

  it('AppState background/inactive → ghi ngay, không chờ debounce', async () => {
    await useReceiveDraft.getState().load(ctx, form())
    expect(AppState.addEventListener).toHaveBeenCalledTimes(1)
    useReceiveDraft.getState().toggleCheck('m-1|u-1')
    expect(await AsyncStorage.getItem(key)).toBeNull()
    listeners.forEach((l) => l('background'))
    await jest.advanceTimersByTimeAsync(0)
    expect(await kv.get<ReceiveDraft>(key)).not.toBeNull()

    useReceiveDraft.getState().toggleCheck('m-2|u-2')
    listeners.forEach((l) => l('inactive'))
    await jest.advanceTimersByTimeAsync(0)
    expect((await kv.get<ReceiveDraft>(key))!.lines[1].checked).toBe(true)
  })

  it('reset (hết phiên) xoá bộ nhớ nhưng giữ bản đã lưu, kể cả ghi đang chờ', async () => {
    await useReceiveDraft.getState().load(ctx, form())
    useReceiveDraft.getState().toggleCheck('m-1|u-1')
    useReceiveDraft.getState().reset()
    expect(useReceiveDraft.getState()).toMatchObject({ draft: null, ctx: null })
    await settle()
    expect((await kv.get<ReceiveDraft>(key))!.lines[0].checked).toBe(true)
  })

  it('bản lưu hỏng (lines không phải mảng) → xoá khoá, dùng bản dựng mới', async () => {
    await AsyncStorage.setItem(key, JSON.stringify({ formSlug: 'pn-1', lines: 'oops' }))
    await useReceiveDraft.getState().load(ctx, form())
    expect(useReceiveDraft.getState().draft!.lines).toHaveLength(2)
    expect(await AsyncStorage.getItem(key)).toBeNull()
  })

  it('bản lưu của phiếu khác dưới khoá này → bỏ qua', async () => {
    const other = { ...draftFromForm(form()), formSlug: 'khac' }
    other.lines[0].checked = true
    await AsyncStorage.setItem(key, JSON.stringify(other))
    await useReceiveDraft.getState().load(ctx, form())
    expect(useReceiveDraft.getState().draft!.lines.some((l) => l.checked)).toBe(false)
  })

  it('dòng thiếu key/quantity → coi là hỏng; "new" không có form → null', async () => {
    const bad = { ...draftFromForm(form()), lines: [{ materialSlug: 'a' }] }
    await AsyncStorage.setItem(key, JSON.stringify(bad))
    await useReceiveDraft.getState().load(ctx, form())
    expect(useReceiveDraft.getState().draft!.lines).toHaveLength(2)
    const nk = draftStorageKey('u1', 'wh1', 'new')
    await AsyncStorage.setItem(nk, JSON.stringify({ formSlug: 'new', lines: 5 }))
    await useReceiveDraft.getState().load({ ...ctx, formSlug: 'new' }, null)
    expect(useReceiveDraft.getState().draft).toBeNull()
    expect(await AsyncStorage.getItem(nk)).toBeNull()
  })

  it('load bản dựng mới không ghi gì; chỉ ghi sau thay đổi đầu tiên', async () => {
    const set = jest.spyOn(kv, 'set')
    await useReceiveDraft.getState().load(ctx, form())
    await settle()
    expect(set).not.toHaveBeenCalled()
    expect(await AsyncStorage.getItem(key)).toBeNull()
    useReceiveDraft.getState().toggleCheck('m-1|u-1')
    await settle()
    expect(await AsyncStorage.getItem(key)).not.toBeNull()
  })

  it('đang ghi (saving) → bỏ qua đánh dấu / sửa / thêm dòng; replace và adoptServerForm vẫn chạy', async () => {
    await useReceiveDraft.getState().load(ctx, form())
    const before = useReceiveDraft.getState().draft
    useReceiveDraft.getState().setSaving(true)
    useReceiveDraft.getState().toggleCheck('m-1|u-1')
    useReceiveDraft.getState().updateLine('m-2|u-2', { quantity: 1 })
    useReceiveDraft.getState().setHeader({ note: 'x' })
    expect(useReceiveDraft.getState().draft).toBe(before)
    useReceiveDraft.getState().adoptServerForm(form(4))
    expect(useReceiveDraft.getState().draft!.version).toBe(4)
    useReceiveDraft.getState().setSaving(false)
    useReceiveDraft.getState().toggleCheck('m-1|u-1')
    expect(useReceiveDraft.getState().draft!.lines[0]!.checked).toBe(true)
  })

  it('reset (hết phiên) mở khoá saving', async () => {
    useReceiveDraft.getState().setSaving(true)
    useReceiveDraft.getState().reset()
    expect(useReceiveDraft.getState().saving).toBe(false)
  })

  it('seed (bản trắng phiếu mới) chỉ đặt bộ nhớ, KHÔNG ghi tới khi người dùng sửa lần đầu', async () => {
    const newCtx: DraftContext = { ...ctx, formSlug: 'new' }
    const newKey = draftStorageKey(ctx.userSlug, ctx.warehouseSlug, 'new')
    await useReceiveDraft.getState().load(newCtx, null)
    const blank = newDraft({
      code: 'PN-GOI-Y',
      invoiceCode: '',
      date: '2026-11-06',
      purchaseOrder: null,
      note: null,
      supplierSlug: null,
    })
    useReceiveDraft.getState().seed(blank)
    expect(useReceiveDraft.getState().draft).toBe(blank)
    await settle()
    expect(await AsyncStorage.getItem(newKey)).toBeNull()
    useReceiveDraft.getState().setHeader({ invoiceCode: 'HD-1' })
    await settle()
    expect(await kv.get<ReceiveDraft>(newKey)).toMatchObject({
      header: { code: 'PN-GOI-Y', invoiceCode: 'HD-1' },
    })
  })

  it('seed không làm gì khi chưa nạp phiếu nào', () => {
    useReceiveDraft.getState().seed(makeDraft([]))
    expect(useReceiveDraft.getState().draft).toBeNull()
  })
})

describe('useReceiveDraft — màn soạn (sửa dòng, đổi đơn vị, xoá dòng)', () => {
  it('updateLine with check:false does not mark checked', async () => {
    await useReceiveDraft.getState().load(ctx, form())
    const r = useReceiveDraft
      .getState()
      .updateLine('m-1|u-1', { quantity: 7, unitPrice: 1500 }, { check: false })
    expect(r).toEqual({ ok: true, key: 'm-1|u-1' })
    expect(useReceiveDraft.getState().draft!.lines[0]).toMatchObject({
      quantity: 7,
      unitPrice: 1500,
      checked: false,
    })
    // Mặc định (checklist): sửa = đánh dấu đã kiểm.
    useReceiveDraft.getState().updateLine('m-2|u-2', { quantity: 3 })
    expect(useReceiveDraft.getState().draft!.lines[1]!.checked).toBe(true)
  })

  it('updateLine with check:false keeps an already-checked line checked', async () => {
    await useReceiveDraft.getState().load(ctx, form())
    useReceiveDraft.getState().toggleCheck('m-1|u-1')
    expect(useReceiveDraft.getState().draft!.lines[0]!.checked).toBe(true)
    useReceiveDraft.getState().updateLine('m-1|u-1', { quantity: 4 }, { check: false })
    expect(useReceiveDraft.getState().draft!.lines[0]).toMatchObject({ quantity: 4, checked: true })
  })

  it('unit change re-keys in place and keeps base', async () => {
    await useReceiveDraft.getState().load(ctx, form())
    const before = useReceiveDraft.getState().draft!.lines[0]!.base
    const units = [
      { unitSlug: 'u-1', unitCode: 'B', unitName: 'bao', conversionRate: 1, isBaseUnit: true },
      { unitSlug: 'u-x', unitCode: 'T', unitName: 'thùng', conversionRate: 24, isBaseUnit: false },
    ]
    const r = useReceiveDraft
      .getState()
      .updateLine('m-1|u-1', { unitSlug: 'u-x', unitName: 'thùng', units }, { check: false })
    expect(r).toEqual({ ok: true, key: 'm-1|u-x' })
    const lines = useReceiveDraft.getState().draft!.lines
    expect(lines.map((l) => l.key)).toEqual(['m-1|u-x', 'm-2|u-2'])
    expect(lines[0]).toMatchObject({ unitSlug: 'u-x', unitName: 'thùng', units, checked: false })
    expect(lines[0]!.base).toBe(before)
    expect(lines[0]!.base!.unitSlug).toBe('u-1')
  })

  it('unit change onto existing key returns duplicate and changes nothing', async () => {
    const f = makeForm([makeItem(1), makeItem(2, { materialSlug: 'm-1', unitSlug: 'u-9' })], {
      slug: 'pn-1',
    })
    await useReceiveDraft.getState().load(ctx, f)
    const before = useReceiveDraft.getState().draft
    const r = useReceiveDraft.getState().updateLine('m-1|u-1', { unitSlug: 'u-9' })
    expect(r).toEqual({ ok: false, reason: 'duplicate', existingKey: 'm-1|u-9' })
    expect(useReceiveDraft.getState().draft).toBe(before)
  })

  it('addLine duplicate returns duplicate', async () => {
    await useReceiveDraft.getState().load(ctx, form())
    const before = useReceiveDraft.getState().draft
    expect(useReceiveDraft.getState().addLine(makeLine(1, { base: null }))).toEqual({
      ok: false,
      reason: 'duplicate',
      existingKey: 'm-1|u-1',
    })
    expect(useReceiveDraft.getState().draft).toBe(before)
    // Khoá luôn tính lại từ vật tư + đơn vị, không tin `key` của người gọi.
    expect(useReceiveDraft.getState().addLine(makeLine(9, { base: null, key: 'sai' }))).toEqual({
      ok: true,
      key: 'm-9|u-9',
    })
    expect(useReceiveDraft.getState().draft!.lines.at(-1)!.key).toBe('m-9|u-9')
  })

  it('removeLine removes and schedules persist', async () => {
    await useReceiveDraft.getState().load(ctx, form())
    useReceiveDraft.getState().removeLine('m-1|u-1')
    expect(useReceiveDraft.getState().draft!.lines.map((l) => l.key)).toEqual(['m-2|u-2'])
    expect(await AsyncStorage.getItem(key)).toBeNull()
    await settle()
    expect((await kv.get<ReceiveDraft>(key))!.lines.map((l) => l.key)).toEqual(['m-2|u-2'])
  })

  it('load of an old saved draft without headerBase sets headerBase = header', async () => {
    // Bản lưu trước khi có `headerBase`, `base.unitSlug` / `base.unitPrice` và `units`.
    const current = draftFromForm(form())
    const old: Omit<ReceiveDraft, 'headerBase' | 'lines'> & {
      headerBase?: unknown
      lines: unknown[]
    } = {
      ...current,
      header: { ...current.header, note: 'đã sửa' },
      lines: current.lines.map(({ base, ...l }) => ({
        ...l,
        checked: true,
        base: { quantity: base!.quantity, expiryDate: base!.expiryDate, note: base!.note },
      })),
    }
    delete old.headerBase
    await kv.set(key, old)
    const r = await useReceiveDraft.getState().load(ctx, form())
    const d = useReceiveDraft.getState().draft!
    expect(d.headerBase).toEqual(old.header)
    expect(d.lines[0]!.base).toEqual({
      unitSlug: 'u-1',
      quantity: 10,
      unitPrice: 1000,
      expiryDate: null,
      note: null,
    })
    expect(d.lines.every((l) => l.checked)).toBe(true)
    // Đầu phiếu đã sửa trước đó không phân biệt được; dòng không bị coi là đã sửa giá / đơn vị.
    expect(r).toMatchObject({ local: true, edited: false, merged: false })
  })

  it('updateLine while saving returns ignored', async () => {
    await useReceiveDraft.getState().load(ctx, form())
    useReceiveDraft.getState().setSaving(true)
    const before = useReceiveDraft.getState().draft
    expect(useReceiveDraft.getState().updateLine('m-1|u-1', { quantity: 1 })).toEqual({
      ok: false,
      reason: 'ignored',
    })
    expect(useReceiveDraft.getState().addLine(makeLine(9, { base: null }))).toEqual({
      ok: false,
      reason: 'ignored',
    })
    useReceiveDraft.getState().removeLine('m-1|u-1')
    expect(useReceiveDraft.getState().draft).toBe(before)
    useReceiveDraft.getState().setSaving(false)
    expect(useReceiveDraft.getState().updateLine('m-404|u', { quantity: 1 })).toEqual({
      ok: false,
      reason: 'ignored',
    })
  })

  it('load sau lệch version gộp đầu phiếu từng trường, báo headerConflicts', async () => {
    await useReceiveDraft.getState().load(ctx, form(3))
    useReceiveDraft.getState().setHeader({ note: 'của tôi', invoiceCode: 'HD-MAY' })
    await settle()
    useReceiveDraft.getState().reset()
    const fresh = makeForm([makeItem(1), makeItem(2)], {
      slug: 'pn-1',
      version: 4,
      invoiceCode: 'HD-WEB',
    })
    const r = await useReceiveDraft.getState().load(ctx, fresh)
    expect(r).toMatchObject({ local: true, edited: true, merged: true })
    expect(r.headerConflicts).toEqual(['invoiceCode'])
    const d = useReceiveDraft.getState().draft!
    expect(d.header).toMatchObject({ note: 'của tôi', invoiceCode: 'HD-WEB' })
    expect(d.headerBase).toMatchObject({ note: null, invoiceCode: 'HD-WEB' })
  })
})

describe('useReceiveDraft — bản lưu cũ thiếu file', () => {
  it('thiếu header.file / headerBase.file vẫn hợp lệ, đọc ra null và PATCH không có key file', async () => {
    const { file: _a, ...oldHeader } = makeDraft([]).header
    const old = {
      ...makeDraft([makeLine(1)]),
      header: oldHeader,
      headerBase: oldHeader,
    }
    expect(isValidDraft(old, 'pn-1')).toBe(true)
    await AsyncStorage.setItem(key, JSON.stringify(old))
    await useReceiveDraft.getState().load(ctx, makeForm([makeItem(1)], { slug: 'pn-1' }))
    const d = useReceiveDraft.getState().draft!
    expect(d.header.file).toBeNull()
    expect(d.headerBase!.file).toBeNull()
    expect(toUpdateInput(d)).not.toHaveProperty('file')
  })
})

describe('useReceiveDraft — phiên bản nháp (session)', () => {
  it('bỏ nháp / hết phiên → session đổi; nạp lại / sửa / gộp cùng phiếu → giữ nguyên', async () => {
    await useReceiveDraft.getState().load(ctx, form())
    const s0 = useReceiveDraft.getState().session
    useReceiveDraft.getState().setHeader({ note: 'x' })
    useReceiveDraft.getState().replace(useReceiveDraft.getState().draft!)
    await useReceiveDraft.getState().load(ctx, form(4))
    expect(useReceiveDraft.getState().session).toBe(s0)

    await useReceiveDraft.getState().discard()
    const s1 = useReceiveDraft.getState().session
    expect(s1).not.toBe(s0)
    // Mở lại đúng phiếu đó sau khi bỏ: vẫn là phiên mới.
    await useReceiveDraft.getState().load(ctx, form())
    expect(useReceiveDraft.getState().session).toBe(s1)

    useReceiveDraft.getState().reset()
    expect(useReceiveDraft.getState().session).not.toBe(s1)
  })
})
