import { renderHook } from '@testing-library/react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'

import { useImportDraftMenu } from './useImportDraftMenu'
import type { ImportWizardDraft } from './useImportWizardDraft'

jest.mock('@/shared/lib/native-confirm', () => ({ confirmAction: jest.fn() }))

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const wizard = (over: Partial<ImportWizardDraft> = {}) =>
  ({
    ready: true,
    saving: false,
    dirty: true,
    isNew: false,
    form: null,
    ctx: { formSlug: 'pn-1' },
    nav: { finishToList: jest.fn() },
    ...over,
  }) as unknown as ImportWizardDraft

const remove = jest.fn().mockResolvedValue(undefined)

async function menu(writing: boolean, over: Partial<ImportWizardDraft> = {}) {
  const { result } = await renderHook(() =>
    useImportDraftMenu({ wizard: wizard(over), writing, remove }),
  )
  return result.current
}
const ids = async (writing: boolean, over: Partial<ImportWizardDraft> = {}) =>
  (await menu(writing, over)).map((i) => i.id)
const canDelete = { abilities: { canDelete: true } } as unknown as Partial<ImportWizardDraft>

describe('useImportDraftMenu', () => {
  it('dirty, not writing → Bỏ thay đổi', async () => {
    expect(await ids(false)).toEqual(['discard'])
  })

  it('Bỏ gates on `writing` (busy while leaving), not only store `saving`', async () => {
    expect(await ids(true, { saving: false })).toEqual([])
  })

  describe('Xoá phiếu nháp', () => {
    it('phiếu có trên server, ready, không ghi, canDelete → có mục (đỏ), kể cả không dirty', async () => {
      const items = await menu(false, { ...canDelete, dirty: false })
      expect(items.map((i) => i.id)).toEqual(['delete'])
      expect(items[0]).toMatchObject({ label: 'Xoá phiếu nháp', destructive: true })
    })

    it('dirty → Bỏ thay đổi rồi Xoá', async () => {
      expect(await ids(false, canDelete)).toEqual(['discard', 'delete'])
    })

    it('bấm → remove()', async () => {
      const items = await menu(false, canDelete)
      items.find((i) => i.id === 'delete')!.onPress()
      expect(remove).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['phiếu mới', { ...canDelete, isNew: true }],
      ['chưa nạp', { ...canDelete, ready: false }],
      ['store đang ghi', { ...canDelete, saving: true }],
      ['không quyền', { abilities: { canDelete: false } }],
      ['chưa có abilities', { abilities: null }],
    ] as [string, Partial<ImportWizardDraft>][])('%s → không có mục Xoá', async (_n, over) => {
      expect(await ids(false, over)).not.toContain('delete')
    })

    it('đang ghi (writing) → không có mục Xoá', async () => {
      expect(await ids(true, canDelete)).toEqual([])
    })
  })
})
