import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, renderHook } from '@testing-library/react-native'

import {
  exportDraftStorageKey,
  stopExportDraftPersistence,
  useExportDraft,
  type ExportDraft,
} from '@/features/export-draft'
import { makeDraft, makeForm, makeItem, makeLine } from '@/features/export-draft/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { confirmAction } from '@/shared/lib/native-confirm'
import { kv } from '@/shared/storage/kv'

import { useExportDraftMenu } from './useExportDraftMenu'
import type { ExportWizardDraft } from './useExportWizardDraft'

jest.mock('@/shared/lib/native-confirm', () => ({ confirmAction: jest.fn() }))

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

/** Bản nháp phiếu đã có, đã sửa trên máy, có quyền xoá — đủ để mọi mục của ⋯ hiện. */
const wizard = (over: Partial<ExportWizardDraft> = {}) =>
  ({
    ready: true,
    saving: false,
    dirty: true,
    isNew: false,
    step1Ok: true,
    abilities: { canDelete: true },
    draft: makeDraft([makeLine(1)]),
    form: null,
    ctx: { formSlug: 'px-1' },
    nav: { finishToList: jest.fn() },
    ...over,
  }) as unknown as ExportWizardDraft

async function items(writing: boolean, over: Partial<ExportWizardDraft> = {}) {
  const { result } = await renderHook(() =>
    useExportDraftMenu({
      wizard: wizard(over),
      remove: jest.fn(async () => {}),
      save: jest.fn(),
      writing,
    }),
  )
  return result.current.map((i) => ({ id: i.id, disabled: !!i.disabled }))
}

describe('useExportDraftMenu', () => {
  it('not writing → Lưu nháp, Bỏ thay đổi, Xoá nháp', async () => {
    expect(await items(false)).toEqual([
      { id: 'save', disabled: false },
      { id: 'discard', disabled: false },
      { id: 'delete', disabled: false },
    ])
  })

  it('Bỏ / Xoá gate on `writing` (busy while leaving), not only store `saving`', async () => {
    // Ghi xong, đang rời luồng: `busy` còn giữ (writing) nhưng store `saving` đã tắt.
    expect(await items(true, { saving: false })).toEqual([{ id: 'save', disabled: true }])
  })
})

describe('useExportDraftMenu — Bỏ thay đổi trên máy', () => {
  const ctx = { userSlug: 'u', warehouseSlug: 'wh-a', formSlug: 'px-1' }
  const KEY = exportDraftStorageKey('u', 'wh-a', 'px-1')

  beforeEach(async () => {
    await AsyncStorage.clear()
    useExportDraft.getState().reset()
    jest.mocked(confirmAction).mockResolvedValue(true)
  })
  afterEach(() => {
    stopExportDraftPersistence()
    useExportDraft.getState().reset()
  })

  it('giữ serial đã lưu (quét lại serial cũ vẫn bị chặn), bỏ phần sửa sau đó', async () => {
    // Đã Lưu nháp: dòng 1 = 2 serial A, B; sau đó quét thêm C.
    const form = makeForm([makeItem(1, { quantity: 2 })], { slug: 'px-1', version: 4 })
    const store = () => useExportDraft.getState()
    await store().load(ctx, makeForm([makeItem(1)], { slug: 'px-1', version: 3 }))
    store().updateLine('m-1|u-1|', { quantity: 2, serials: ['A', 'B'] })
    store().adoptServerForm(form)
    store().updateLine('m-1|u-1|', { quantity: 3, serials: ['A', 'B', 'C'] })
    const onDiscarded = jest.fn()
    const { result } = await renderHook(() =>
      useExportDraftMenu({
        wizard: wizard({ form, ctx, draft: store().draft! } as never),
        remove: jest.fn(async () => {}),
        save: jest.fn(),
        writing: false,
        onDiscarded,
      }),
    )
    await act(async () => {
      result.current.find((i) => i.id === 'discard')!.onPress()
      for (let n = 0; n < 5; n++) await new Promise((r) => setTimeout(r, 0))
    })
    expect(store().draft!.lines[0]).toMatchObject({ quantity: 2, serials: ['A', 'B'] })
    expect((await kv.get<ExportDraft>(KEY))!.lines[0]!.serials).toEqual(['A', 'B'])
    expect(onDiscarded).toHaveBeenCalledTimes(1)
  })
})
