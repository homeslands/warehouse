import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'

import { kv } from '@/shared/storage/kv'

import { draftFromForm, newExportDraft, toInput, type ExportDraft } from './draft'
import {
  exportDraftStorageKey,
  isValidDraft,
  stopExportDraftPersistence,
  useExportDraft,
  type DraftContext,
} from './draft.store'
import { makeDraft, makeForm, makeItem, makeLine } from './fixtures'

const ctx: DraftContext = { userSlug: 'u1', warehouseSlug: 'wh1', formSlug: 'px-1' }
const key = exportDraftStorageKey(ctx.userSlug, ctx.warehouseSlug, ctx.formSlug)
const form = (version = 3) => makeForm([makeItem(1), makeItem(2)], { slug: 'px-1', version })
const store = () => useExportDraft.getState()

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
  store().reset()
})

afterEach(() => {
  stopExportDraftPersistence()
  jest.restoreAllMocks()
  jest.useRealTimers()
})

const settle = () => jest.advanceTimersByTimeAsync(400)

describe('exportDraftStorageKey', () => {
  it('ghép theo user, kho, phiếu', () => {
    expect(exportDraftStorageKey('u', 'w', 'new')).toBe('warehouse.exportDraft.u.w.new')
  })
})

describe('useExportDraft', () => {
  it('load không có bản lưu → draftFromForm, không ghi gì (mở chỉ xem không để lại gì)', async () => {
    const set = jest.spyOn(kv, 'set')
    expect(await store().load(ctx, form())).toEqual({
      local: false,
      edited: false,
      merged: false,
      removed: [],
      headerConflicts: [],
    })
    await settle()
    expect(store().draft!.lines).toHaveLength(2)
    expect(set).not.toHaveBeenCalled()
    expect(await AsyncStorage.getItem(key)).toBeNull()
  })

  it('"new" không có form → bản trắng, cũng không ghi', async () => {
    const set = jest.spyOn(kv, 'set')
    await store().load({ ...ctx, formSlug: 'new' }, null)
    await settle()
    expect(store().draft).toMatchObject({ version: null, lines: [] })
    expect(set).not.toHaveBeenCalled()
  })

  it('ghi sau sửa đầu tiên, debounce 300ms một lần', async () => {
    await store().load(ctx, form())
    const set = jest.spyOn(kv, 'set')
    store().updateLine('m-1|u-1|', { quantity: 7 })
    store().setHeader({ receiver: 'B' })
    await jest.advanceTimersByTimeAsync(299)
    expect(set).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(2)
    expect(set).toHaveBeenCalledTimes(1)
    const saved = await kv.get<ExportDraft>(key)
    expect(saved!.lines[0]!.quantity).toBe(7)
    expect(saved!.header.receiver).toBe('B')
  })

  it('khôi phục đúng ctx; khác user hoặc kho thì không thấy', async () => {
    await store().load(ctx, form())
    store().updateLine('m-1|u-1|', { quantity: 7 })
    await settle()
    for (const other of [
      { ...ctx, userSlug: 'u2' },
      { ...ctx, warehouseSlug: 'wh2' },
    ]) {
      store().reset()
      await store().load(other, form())
      expect(store().draft!.lines[0]!.quantity).toBe(10)
    }
    store().reset()
    expect(await store().load(ctx, form())).toMatchObject({ local: true, edited: true })
    expect(store().draft!.lines[0]!.quantity).toBe(7)
  })

  it('version đổi → gộp, báo merged + removed, và ghi bản đã gộp', async () => {
    await store().load(ctx, form(3))
    store().updateLine('m-1|u-1|', { quantity: 7 })
    await settle()
    store().reset()
    const fresh = makeForm([makeItem(1, { unitPrice: 2000 })], { slug: 'px-1', version: 4 })
    expect(await store().load(ctx, fresh)).toEqual({
      local: true,
      edited: true,
      merged: true,
      removed: ['Vật tư 2'],
      headerConflicts: [],
    })
    expect(store().draft!.version).toBe(4)
    expect(store().draft!.lines[0]).toMatchObject({
      quantity: 7,
      unitPrice: 2000,
      changedOnServer: true,
    })
    await settle()
    expect((await kv.get<ExportDraft>(key))!.version).toBe(4)
  })

  it('chỉ sửa đầu phiếu + version đổi → giữ đầu phiếu đã sửa, edited true (màn báo đã gộp)', async () => {
    await store().load(ctx, form(3))
    store().setHeader({ type: 'DISPOSAL' })
    await settle()
    store().reset()
    const fresh = makeForm([makeItem(1), makeItem(2)], {
      slug: 'px-1',
      version: 4,
      receiver: 'Bếp B',
    })
    expect(await store().load(ctx, fresh)).toEqual({
      local: true,
      edited: true,
      merged: true,
      removed: [],
      headerConflicts: [],
    })
    expect(store().draft!.header).toMatchObject({ type: 'DISPOSAL', receiver: 'Bếp B' })
  })

  it('xung đột đầu phiếu khi load → lấy server, báo trường', async () => {
    await store().load(ctx, form(3))
    store().setHeader({ type: 'DISPOSAL' })
    await settle()
    store().reset()
    const fresh = makeForm([makeItem(1), makeItem(2)], { slug: 'px-1', version: 4, type: 'SALE' })
    expect(await store().load(ctx, fresh)).toMatchObject({
      merged: true,
      headerConflicts: ['type'],
    })
    expect(store().draft!.header.type).toBe('SALE')
  })

  it('bản lưu cũ chưa có headerBase vẫn mở được: headerBase = đầu phiếu đang lưu', async () => {
    const legacy: Record<string, unknown> = { ...draftFromForm(form()) }
    delete legacy.headerBase
    legacy.header = { ...(legacy.header as object), receiver: 'Bếp C' }
    await kv.set(key, legacy)
    expect(await store().load(ctx, form())).toMatchObject({ local: true, edited: false })
    expect(store().draft!.header.receiver).toBe('Bếp C')
    expect(store().draft!.headerBase).toEqual(store().draft!.header)
  })

  it('addLine / updateLine / removeLine; đổi lô đổi khoá dòng', async () => {
    await store().load(ctx, form())
    store().addLine(makeLine(9, { base: null }))
    expect(store().draft!.lines).toHaveLength(3)
    store().updateLine('m-1|u-1|', { batchSlug: 'b1', batchExpiryDate: '2027-01-01' })
    expect(store().draft!.lines[0]).toMatchObject({
      key: 'm-1|u-1|b1',
      batchSlug: 'b1',
      batchExpiryDate: '2027-01-01',
    })
    store().updateLine('khong-co', { quantity: 1 })
    store().removeLine('m-2|u-2|')
    expect(store().draft!.lines.map((l) => l.key)).toEqual(['m-1|u-1|b1', 'm-9|u-9|'])
    await settle()
    expect((await kv.get<ExportDraft>(key))!.lines).toHaveLength(2)
  })

  it('khoá dòng luôn duy nhất: đổi lô sang khoá đã có / thêm dòng trùng bị từ chối, không đổi gì', async () => {
    await store().load(ctx, form())
    store().addLine(makeLine(1, { batchSlug: 'b1', base: null }))
    const before = store().draft
    // m-1 tự động → b1 đã có dòng m-1|u-1|b1
    expect(store().updateLine('m-1|u-1|', { batchSlug: 'b1' })).toEqual({
      ok: false,
      reason: 'duplicate',
      existingKey: 'm-1|u-1|b1',
    })
    expect(store().addLine(makeLine(2, { base: null }))).toEqual({
      ok: false,
      reason: 'duplicate',
      existingKey: 'm-2|u-2|',
    })
    expect(store().draft).toBe(before)
    // đổi lô sang khoá chưa có → ok, trả khoá mới; sửa số không đổi khoá → ok
    expect(store().updateLine('m-1|u-1|', { batchSlug: 'b9' })).toEqual({
      ok: true,
      key: 'm-1|u-1|b9',
    })
    expect(store().updateLine('m-2|u-2|', { quantity: 3 })).toEqual({ ok: true, key: 'm-2|u-2|' })
    expect(store().addLine(makeLine(7, { base: null }))).toEqual({ ok: true, key: 'm-7|u-7|' })
  })

  it('updateLine đổi đơn vị tại chỗ: giữ vị trí và base, khoá mới; trùng dòng khác thì từ chối, không ghi', async () => {
    await store().load(ctx, makeForm([makeItem(1), makeItem(2)]))
    const before = store().draft!.lines[0]!.base
    expect(
      store().updateLine('m-1|u-1|', { unitSlug: 'u-9', unitName: 'thùng', conversionRate: 12 }),
    ).toEqual({ ok: true, key: 'm-1|u-9|' })
    const lines = store().draft!.lines
    expect(lines.map((l) => l.key)).toEqual(['m-1|u-9|', 'm-2|u-2|'])
    expect(lines[0]).toMatchObject({ unitSlug: 'u-9', unitName: 'thùng', conversionRate: 12 })
    expect(lines[0]!.base).toEqual(before)
    expect(before).toMatchObject({ unitSlug: 'u-1' })
    // Đổi sang đơn vị đã có dòng khác (cùng vật tư + lô) → trùng.
    store().addLine(makeLine(1, { unitSlug: 'u-5', base: null }))
    expect(store().updateLine('m-1|u-9|', { unitSlug: 'u-5', unitName: 'bao' })).toEqual({
      ok: false,
      reason: 'duplicate',
      existingKey: 'm-1|u-5|',
    })
    expect(store().draft!.lines[0]!.unitSlug).toBe('u-9')
  })

  it('updateLine / addLine báo bị bỏ qua khi khoá saving, khoá không có, hoặc chưa có bản nháp', async () => {
    expect(store().addLine(makeLine(1))).toEqual({ ok: false, reason: 'ignored' })
    await store().load(ctx, form())
    expect(store().updateLine('khong-co', { quantity: 1 })).toEqual({
      ok: false,
      reason: 'ignored',
    })
    store().setSaving(true)
    expect(store().updateLine('m-1|u-1|', { quantity: 1 })).toEqual({
      ok: false,
      reason: 'ignored',
    })
  })

  it('removeLine xoá đúng một dòng', async () => {
    await store().load(ctx, form())
    store().addLine(makeLine(1, { batchSlug: 'b1', base: null }))
    store().removeLine('m-1|u-1|b1')
    expect(store().draft!.lines.map((l) => l.key)).toEqual(['m-1|u-1|', 'm-2|u-2|'])
  })

  it('removeLine chỉ xoá dòng đầu khớp khi có hai dòng cùng khoá (bản lưu cũ)', async () => {
    await store().load(ctx, form())
    const d = store().draft!
    useExportDraft.setState({
      draft: { ...d, lines: [...d.lines, { ...d.lines[0]!, quantity: 99 }] },
    })
    store().removeLine('m-1|u-1|')
    const lines = store().draft!.lines
    expect(lines.map((l) => [l.key, l.quantity])).toEqual([
      ['m-2|u-2|', 10],
      ['m-1|u-1|', 99],
    ])
  })

  it('addLine tính lại khoá từ vật tư + đơn vị + lô, không tin line.key', async () => {
    await store().load(ctx, form())
    expect(store().addLine({ ...makeLine(9, { base: null }), key: 'sai' })).toEqual({
      ok: true,
      key: 'm-9|u-9|',
    })
    expect(store().draft!.lines[2]!.key).toBe('m-9|u-9|')
    // khoá gửi vào khác nhưng khoá thật đã có → trùng
    expect(store().addLine({ ...makeLine(1, { base: null }), key: 'khac' })).toEqual({
      ok: false,
      reason: 'duplicate',
      existingKey: 'm-1|u-1|',
    })
  })

  it('discard xoá khoá và bản nháp, kể cả ghi đang chờ', async () => {
    await store().load(ctx, form())
    store().updateLine('m-1|u-1|', { quantity: 7 })
    await store().discard()
    await settle()
    expect(await AsyncStorage.getItem(key)).toBeNull()
    expect(store().draft).toBeNull()
  })

  it('adoptServerForm từ new: xoá khoá new, không để lại bản lưu, ctx sang slug mới', async () => {
    const newCtx: DraftContext = { ...ctx, formSlug: 'new' }
    await store().load(newCtx, null)
    store().addLine(makeLine(1, { base: null }))
    await settle()
    const newKey = exportDraftStorageKey('u1', 'wh1', 'new')
    expect(await AsyncStorage.getItem(newKey)).not.toBeNull()
    store().addLine(makeLine(2, { base: null })) // ghi đang chờ phải bị huỷ
    store().adoptServerForm(makeForm([makeItem(1)], { slug: 'px-7', version: 1 }))
    await settle()
    expect(await AsyncStorage.getItem(newKey)).toBeNull()
    expect(await AsyncStorage.getItem(exportDraftStorageKey('u1', 'wh1', 'px-7'))).toBeNull()
    expect(store().ctx?.formSlug).toBe('px-7')
    expect(store().draft).toEqual(
      draftFromForm(makeForm([makeItem(1)], { slug: 'px-7', version: 1 })),
    )
  })

  it('adoptServerForm xoá bản lưu cũ của chính phiếu (không hồi sinh bản đã gửi)', async () => {
    await store().load(ctx, form(3))
    store().updateLine('m-1|u-1|', { quantity: 7 })
    await settle()
    expect(await AsyncStorage.getItem(key)).not.toBeNull()
    store().adoptServerForm(form(4))
    await settle()
    expect(await AsyncStorage.getItem(key)).toBeNull()
    expect(store().draft!.version).toBe(4)
  })

  it('replace (bản đã gộp sau lệch version) thay bản nháp và ghi, kể cả khi đang khoá saving', async () => {
    await store().load(ctx, form(3))
    const merged = { ...draftFromForm(form(4)), lines: [makeLine(1, { quantity: 5 })] }
    store().setSaving(true)
    store().replace(merged)
    expect(store().draft).toBe(merged)
    await settle()
    expect((await kv.get<ExportDraft>(key))!.version).toBe(4)
  })

  it('replace không làm gì khi chưa nạp phiếu nào', async () => {
    store().replace(draftFromForm(form()))
    expect(store().draft).toBeNull()
  })

  it('seed (bản trắng có mã gợi ý) chỉ đặt bộ nhớ, KHÔNG ghi tới khi người dùng sửa lần đầu', async () => {
    const newCtx = { ...ctx, formSlug: 'new' }
    const newKey = exportDraftStorageKey(ctx.userSlug, ctx.warehouseSlug, 'new')
    await store().load(newCtx, null)
    const set = jest.spyOn(kv, 'set')
    const blank = newExportDraft({ code: 'PX-GOI-Y' })
    store().seed(blank)
    expect(store().draft).toBe(blank)
    await settle()
    expect(set).not.toHaveBeenCalled()
    store().setHeader({ receiver: 'B' })
    await settle()
    expect(await kv.get<ExportDraft>(newKey)).toMatchObject({
      header: { code: 'PX-GOI-Y', receiver: 'B' },
    })
  })

  it('seed không làm gì khi chưa nạp phiếu nào', async () => {
    store().seed(newExportDraft({ code: 'PX-1' }))
    expect(store().draft).toBeNull()
  })

  it('AppState background → ghi ngay, không chờ debounce', async () => {
    await store().load(ctx, form())
    store().updateLine('m-1|u-1|', { quantity: 7 })
    expect(await AsyncStorage.getItem(key)).toBeNull()
    listeners.forEach((l) => l('background'))
    await jest.advanceTimersByTimeAsync(0)
    expect(await kv.get<ExportDraft>(key)).not.toBeNull()
  })

  it('đổi phiếu (load khác) ghi nốt phần đang chờ của phiếu trước', async () => {
    await store().load(ctx, form())
    store().updateLine('m-1|u-1|', { quantity: 7 })
    await store().load({ ...ctx, formSlug: 'px-2' }, makeForm([makeItem(1)], { slug: 'px-2' }))
    expect((await kv.get<ExportDraft>(key))!.lines[0]!.quantity).toBe(7)
  })

  it('reset (hết phiên) xoá bộ nhớ nhưng giữ bản đã lưu, kể cả ghi đang chờ', async () => {
    await store().load(ctx, form())
    store().updateLine('m-1|u-1|', { quantity: 7 })
    store().reset()
    expect(store()).toMatchObject({ draft: null, ctx: null })
    await settle()
    expect((await kv.get<ExportDraft>(key))!.lines[0]!.quantity).toBe(7)
  })

  it('bản lưu hỏng → xoá khoá, dùng bản dựng mới', async () => {
    await AsyncStorage.setItem(key, JSON.stringify({ header: {}, lines: 'oops' }))
    await store().load(ctx, form())
    expect(store().draft!.lines).toHaveLength(2)
    expect(await AsyncStorage.getItem(key)).toBeNull()
  })

  it('khoá saving: bỏ qua mọi sửa; adoptServerForm vẫn chạy; reset mở khoá', async () => {
    await store().load(ctx, form())
    const before = store().draft
    store().setSaving(true)
    store().updateLine('m-1|u-1|', { quantity: 1 })
    store().addLine(makeLine(9, { base: null }))
    store().removeLine('m-2|u-2|')
    store().setHeader({ note: 'x' })
    expect(store().draft).toBe(before)
    await settle()
    expect(await AsyncStorage.getItem(key)).toBeNull()
    store().adoptServerForm(form(4))
    expect(store().draft!.version).toBe(4)
    store().reset()
    expect(store().saving).toBe(false)
  })
})

describe('useExportDraft — bản lưu cũ thiếu file', () => {
  it('thiếu header.file / headerBase.file vẫn hợp lệ, đọc ra null và PATCH không có key file', async () => {
    const { file: _a, ...oldHeader } = makeDraft([]).header
    const old = { ...makeDraft([makeLine(1)]), header: oldHeader, headerBase: oldHeader }
    expect(isValidDraft(old)).toBe(true)
    await AsyncStorage.setItem(key, JSON.stringify(old))
    await store().load(ctx, makeForm([makeItem(1)], { slug: 'px-1' }))
    const d = store().draft!
    expect(d.header.file).toBeNull()
    expect(d.headerBase!.file).toBeNull()
    expect(toInput(d)).not.toHaveProperty('file')
  })
})

describe('useExportDraft — phiên bản nháp (session)', () => {
  it('bỏ nháp / hết phiên → session đổi; nạp lại / sửa / gộp cùng phiếu → giữ nguyên', async () => {
    await store().load(ctx, form())
    const s0 = store().session
    store().setHeader({ note: 'x' })
    store().replace(store().draft!)
    await store().load(ctx, form(4))
    expect(store().session).toBe(s0)

    await store().discard()
    const s1 = store().session
    expect(s1).not.toBe(s0)
    await store().load(ctx, form())
    expect(store().session).toBe(s1)

    store().reset()
    expect(store().session).not.toBe(s1)
  })
})
