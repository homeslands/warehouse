import AsyncStorage from '@react-native-async-storage/async-storage'

import { draftStorageKey, stopDraftPersistence, useReceiveDraft } from './draft.store'
import { makeDraft, makeForm, makeItem, makeLine } from './fixtures'
import { draftFromForm } from './draft'
import { dropLocalDraft, hasLocalWork, peekLocalProgress } from './local-progress'

const ctx = { userSlug: 'u1', warehouseSlug: 'wh1', formSlug: 'pn-1' }
const key = draftStorageKey('u1', 'wh1', 'pn-1')

/** 6 dòng, 3 đã kiểm (như mockup "đã kiểm 3/6"). */
const sixLines = () =>
  makeDraft(Array.from({ length: 6 }, (_, i) => makeLine(i + 1, { checked: i < 3 })))

beforeEach(async () => {
  await AsyncStorage.clear()
  useReceiveDraft.getState().reset()
})

afterEach(() => {
  stopDraftPersistence()
  useReceiveDraft.getState().reset()
})

describe('peekLocalProgress', () => {
  it('không có gì trên máy → null', async () => {
    expect(await peekLocalProgress(ctx)).toBeNull()
  })

  it('bản lưu trên máy (kv) → số dòng đã kiểm / tổng số dòng', async () => {
    await AsyncStorage.setItem(key, JSON.stringify(sixLines()))
    expect(await peekLocalProgress(ctx)).toEqual({ checked: 3, total: 6 })
  })

  it('ưu tiên bản nháp trong bộ nhớ khi đúng (người dùng, kho, phiếu) — kể cả khi chưa kịp ghi', async () => {
    await AsyncStorage.setItem(key, JSON.stringify(sixLines()))
    const inMemory = makeDraft([makeLine(1, { checked: true }), makeLine(2)])
    useReceiveDraft.setState({ ctx, draft: inMemory })
    expect(await peekLocalProgress(ctx)).toEqual({ checked: 1, total: 2 })
  })

  it('bản trong bộ nhớ của phiếu / kho / người khác → đọc bản lưu của phiếu này', async () => {
    await AsyncStorage.setItem(key, JSON.stringify(sixLines()))
    for (const other of [
      { ...ctx, formSlug: 'pn-2' },
      { ...ctx, warehouseSlug: 'wh2' },
      { ...ctx, userSlug: 'u2' },
    ]) {
      useReceiveDraft.setState({
        ctx: other,
        draft: makeDraft([makeLine(1)], { formSlug: other.formSlug }),
      })
      expect(await peekLocalProgress(ctx)).toEqual({ checked: 3, total: 6 })
    }
  })

  it('đúng ngữ cảnh nhưng bản nháp trong bộ nhớ đã bị bỏ (null) → đọc bản lưu', async () => {
    useReceiveDraft.setState({ ctx, draft: null })
    expect(await peekLocalProgress(ctx)).toBeNull()
    await AsyncStorage.setItem(key, JSON.stringify(sixLines()))
    expect(await peekLocalProgress(ctx)).toEqual({ checked: 3, total: 6 })
  })

  it('chỉ đọc: không nạp vào store, không xoá / ghi bản lưu (kể cả bản hỏng)', async () => {
    await AsyncStorage.setItem(key, JSON.stringify(sixLines()))
    await peekLocalProgress(ctx)
    expect(useReceiveDraft.getState().ctx).toBeNull()
    expect(useReceiveDraft.getState().draft).toBeNull()
    expect(JSON.parse((await AsyncStorage.getItem(key))!)).toEqual(sixLines())

    await AsyncStorage.setItem(key, JSON.stringify({ formSlug: 'pn-1', lines: 'hỏng' }))
    expect(await peekLocalProgress(ctx)).toBeNull()
    expect(await AsyncStorage.getItem(key)).not.toBeNull()
  })

  it('bản lưu của phiếu khác nằm nhầm khoá → null', async () => {
    await AsyncStorage.setItem(key, JSON.stringify(makeDraft([makeLine(1)], { formSlug: 'pn-9' })))
    expect(await peekLocalProgress(ctx)).toBeNull()
  })
})

describe('dropLocalDraft', () => {
  it('xoá bản lưu trên máy của (người dùng, kho, phiếu); khoá khác giữ nguyên', async () => {
    const other = draftStorageKey('u1', 'wh1', 'pn-2')
    await AsyncStorage.setItem(key, JSON.stringify(sixLines()))
    await AsyncStorage.setItem(other, JSON.stringify(sixLines()))
    await dropLocalDraft(ctx)
    expect(await AsyncStorage.getItem(key)).toBeNull()
    expect(await AsyncStorage.getItem(other)).not.toBeNull()
  })

  it('bản nháp trong bộ nhớ đúng ngữ cảnh, không đang lưu → bỏ luôn (kể cả phần chưa kịp ghi)', async () => {
    jest.useFakeTimers()
    useReceiveDraft.setState({ ctx, draft: makeDraft([makeLine(1)]) })
    useReceiveDraft.getState().toggleCheck('m-1|u-1') // hẹn ghi sau 300ms
    await dropLocalDraft(ctx)
    await jest.advanceTimersByTimeAsync(400)
    expect(useReceiveDraft.getState().draft).toBeNull()
    expect(await AsyncStorage.getItem(key)).toBeNull()
    jest.useRealTimers()
  })

  it('đang Lưu / Xác nhận đúng phiếu này → không đụng bản trong bộ nhớ (kết quả gửi sẽ tự xử lý)', async () => {
    const inMemory = makeDraft([makeLine(1, { checked: true })])
    useReceiveDraft.setState({ ctx, draft: inMemory, saving: true })
    await AsyncStorage.setItem(key, JSON.stringify(sixLines()))
    await dropLocalDraft(ctx)
    expect(useReceiveDraft.getState().draft).toBe(inMemory)
    expect(await AsyncStorage.getItem(key)).toBeNull()
  })

  it('bộ nhớ đang giữ phiếu khác → không đụng nó', async () => {
    const other = { ...ctx, formSlug: 'pn-2' }
    const inMemory = makeDraft([makeLine(1)], { formSlug: 'pn-2' })
    useReceiveDraft.setState({ ctx: other, draft: inMemory })
    await dropLocalDraft(ctx)
    expect(useReceiveDraft.getState().ctx).toEqual(other)
    expect(useReceiveDraft.getState().draft).toBe(inMemory)
  })
})

describe('hasLocalWork', () => {
  const form = makeForm([makeItem(1), makeItem(2)])
  const clean = () => draftFromForm(form)

  it('không có gì trên máy → false', async () => {
    expect(await hasLocalWork(ctx, form)).toBe(false)
  })

  it('bản dựng sạch từ phiếu trong bộ nhớ → false', async () => {
    useReceiveDraft.setState({ ctx, draft: clean() })
    expect(await hasLocalWork(ctx, form)).toBe(false)
  })

  it('bản sạch trong kv → false', async () => {
    await AsyncStorage.setItem(key, JSON.stringify(clean()))
    expect(await hasLocalWork(ctx, form)).toBe(false)
  })

  it('có dòng đã kiểm → true', async () => {
    const d = clean()
    d.lines[0] = { ...d.lines[0], checked: true }
    await AsyncStorage.setItem(key, JSON.stringify(d))
    expect(await hasLocalWork(ctx, form)).toBe(true)
  })

  it('sửa số lượng (không kiểm) → true', async () => {
    const d = clean()
    d.lines[0] = { ...d.lines[0], quantity: 99 }
    useReceiveDraft.setState({ ctx, draft: d })
    expect(await hasLocalWork(ctx, form)).toBe(true)
  })
})

describe('cờ RECEIVE_CHECKLIST_ENABLED tắt', () => {
  const setFlag = (v: boolean) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./flags').__setChecklistEnabled(v)

  it('peekLocalProgress → null dù còn dấu kiểm cũ trên máy', async () => {
    setFlag(false)
    await AsyncStorage.setItem(key, JSON.stringify(sixLines()))
    expect(await peekLocalProgress(ctx)).toBeNull()
  })

  it('hasLocalWork: dấu kiểm cũ không tính; sửa thật vẫn tính', async () => {
    setFlag(false)
    const form = makeForm(Array.from({ length: 6 }, (_, i) => makeItem(i + 1)))
    const clean = draftFromForm(form)
    clean.lines = clean.lines.map((l) => ({ ...l, checked: true }))
    await AsyncStorage.setItem(key, JSON.stringify(clean))
    expect(await hasLocalWork(ctx, form)).toBe(false)
    clean.lines[0] = { ...clean.lines[0]!, quantity: 99 }
    await AsyncStorage.setItem(key, JSON.stringify(clean))
    expect(await hasLocalWork(ctx, form)).toBe(true)
  })
})
