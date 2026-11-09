import { renderHook } from '@testing-library/react-native'

import { makeDraft, makeLine } from '@/features/export-draft/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'

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
