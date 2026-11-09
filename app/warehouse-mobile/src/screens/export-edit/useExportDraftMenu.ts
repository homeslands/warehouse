import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { canSave, useExportDraft } from '@/features/export-draft'
import { confirmAction } from '@/shared/lib/native-confirm'
import type { WizardMenuItem } from '@/shared/ui/compose'

import type { ExportWizardDraft } from './useExportWizardDraft'

/**
 * Các mục của menu `⋯` trên header các bước phiếu xuất (spec wizard-apple §3; iOS bước 1–2 menu GỐC thả
 * xuống, bước 3 action sheet; Android `chooseAction` — `WizardHeader` lo phần vẽ), theo thứ tự:
 * - **Lưu nháp** (luôn có khi bản nháp sẵn sàng; `disabled` trừ khi server chắc chắn nhận — đầu phiếu đủ,
 *   `canSave`, phiếu mới hoặc đã đổi gì — và không đang ghi) → `save` (màn truyền `useExportActions.save`,
 *   hỏi lại).
 * - **Bỏ thay đổi trên máy** (phiếu có: bỏ bản nháp + nạp lại) / **Bỏ phiếu mới** (bỏ + `nav.finishToList`)
 *   — đỏ, chỉ khi có gì để bỏ (`dirty`) và không đang ghi (store từ chối bỏ giữa lúc ghi mà không báo).
 * - **Xoá nháp** — đỏ, phiếu đã có + `canDelete`, không đang ghi → `remove` (tự hỏi lại).
 * "Đang ghi" = `writing` của màn (`busy` của `useExportActions` — còn giữ cả lúc rời luồng sau khi ghi
 * xong — hoặc store `saving`). Chưa nạp → không mục nào (không có `⋯`). `onDiscarded` sau khi bỏ xong.
 */
export function useExportDraftMenu({
  wizard,
  remove,
  save,
  writing,
  onDiscarded,
}: {
  wizard: ExportWizardDraft
  remove: () => Promise<void>
  save: () => void
  /** Đang ghi lên server (`busy` của `useExportActions` hoặc store `saving`). */
  writing: boolean
  onDiscarded?: () => void
}): readonly WizardMenuItem[] {
  const { t } = useTranslation(['exportForms', 'common'])
  const { ready, saving, dirty, isNew, abilities, form, ctx, nav, step1Ok, draft } = wizard
  const formSlug = ctx?.formSlug
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  // `remove` / `save` / `onDiscarded` / `nav` đổi định danh mỗi lần render: giữ qua ref để các mục ổn
  // định.
  const latest = useRef({ remove, save, onDiscarded, nav })
  useEffect(() => {
    latest.current = { remove, save, onDiscarded, nav }
  })

  /** "Bỏ thay đổi trên máy" / "Bỏ phiếu mới" (hỏi lại trước). */
  const discard = useCallback(async () => {
    const key = isNew ? 'discardNew' : 'discard'
    const ok = await confirmAction({
      title: t(`exportForms:edit.menu.${key}`),
      message: t(`exportForms:edit.menu.${key}Message`),
      confirmLabel: t(`exportForms:edit.menu.${key}`),
      cancelLabel: t('common:cancel'),
      destructive: true,
    })
    if (!ok) return
    const store = useExportDraft.getState()
    if (store.saving || store.ctx?.formSlug !== formSlug) return
    await store.discard()
    if (isNew) latest.current.nav.finishToList()
    else if (form && ctx) await store.load(ctx, form)
    if (mounted.current) latest.current.onDiscarded?.()
  }, [t, isNew, formSlug, form, ctx])

  // "Lưu nháp" bật khi server chắc chắn nhận (spec form-wizard §3.1, giữ nguyên).
  const saveEnabled =
    ready && step1Ok && !!draft && canSave(draft).ok && (isNew || dirty) && !saving && !writing
  const idle = !saving && !writing
  const canDelete = ready && idle && !isNew && !!abilities?.canDelete
  // Phiếu mới: chỉ khi đã nhập gì (bản trắng không có gì để bỏ) — cùng quy tắc với phiếu nhập.
  const hasLocalChanges = ready && idle && dirty

  const pressSave = useCallback(() => latest.current.save(), [])
  const pressDiscard = useCallback(() => void discard(), [discard])
  const pressDelete = useCallback(() => void latest.current.remove(), [])

  return useMemo(() => {
    if (!ready) return []
    const save: WizardMenuItem = {
      id: 'save',
      label: t('exportForms:wizard.saveDraft'),
      disabled: !saveEnabled,
      onPress: pressSave,
    }
    const discardItem: WizardMenuItem = {
      id: 'discard',
      label: t(isNew ? 'exportForms:edit.menu.discardNew' : 'exportForms:edit.menu.discard'),
      destructive: true,
      onPress: pressDiscard,
    }
    const deleteItem: WizardMenuItem = {
      id: 'delete',
      label: t('exportForms:edit.menu.delete'),
      destructive: true,
      onPress: pressDelete,
    }
    return [save, ...(hasLocalChanges ? [discardItem] : []), ...(canDelete ? [deleteItem] : [])]
  }, [
    t,
    ready,
    saveEnabled,
    hasLocalChanges,
    canDelete,
    isNew,
    pressSave,
    pressDiscard,
    pressDelete,
  ])
}
