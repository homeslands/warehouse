import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useReceiveDraft } from '@/features/receive-checklist'
import { confirmAction } from '@/shared/lib/native-confirm'
import type { WizardMenuItem } from '@/shared/ui/compose'

import type { ImportWizardDraft } from './useImportWizardDraft'

/**
 * Các mục của menu `⋯` trên header các bước phiếu nhập (spec wizard-apple §3; iOS bước 1–2 menu GỐC thả
 * xuống, bước 3 action sheet; Android `chooseAction` — `WizardHeader` lo phần vẽ), đỏ cả hai:
 * - Bỏ thay đổi trên máy (phiếu có: bỏ bản nháp + nạp lại) / Bỏ phiếu mới (bỏ bản nháp +
 *   `nav.finishToList`) — chỉ khi có gì để bỏ (`dirty`).
 * - Xoá phiếu nháp — phiếu đã có trên server (`!isNew`) + `abilities.canDelete`, KỂ CẢ khi không `dirty`;
 *   bấm → `remove` (của `useReceiveActions`, tự hỏi lại).
 * KHÔNG có "Lưu nháp" (phiếu nhập chỉ lưu ở bước 3). Mục nào cũng chỉ hiện khi đã nạp (`ready`) và không
 * đang ghi (`writing` của màn — `busy` của `useReceiveActions`, còn giữ cả lúc rời luồng sau khi ghi xong
 * — hoặc store `saving`); không có mục nào → rỗng (không có `⋯`). `onDiscarded` sau khi bỏ xong.
 */
export function useImportDraftMenu({
  wizard,
  writing,
  remove,
  onDiscarded,
}: {
  wizard: ImportWizardDraft
  /** Đang ghi lên server (`busy` của `useReceiveActions` hoặc store `saving`). */
  writing: boolean
  /** `remove` của `useReceiveActions` (tự hỏi lại). */
  remove: () => Promise<void>
  onDiscarded?: () => void
}): readonly WizardMenuItem[] {
  const { t } = useTranslation(['importForms', 'common'])
  const { ready, saving, dirty, isNew, form, ctx, nav, abilities } = wizard
  const formSlug = ctx?.formSlug
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  // `onDiscarded` / `nav` đổi định danh mỗi lần render: giữ qua ref để mục ổn định.
  const latest = useRef({ onDiscarded, nav, remove })
  useEffect(() => {
    latest.current = { onDiscarded, nav, remove }
  })

  /** "Bỏ thay đổi trên máy" / "Bỏ phiếu mới" (hỏi lại trước). */
  const discard = useCallback(async () => {
    const key = isNew ? 'discardNew' : 'discard'
    const ok = await confirmAction({
      title: t(`importForms:receive.menu.${key}`),
      message: t(`importForms:receive.menu.${key}Message`),
      confirmLabel: t(`importForms:receive.menu.${key}`),
      cancelLabel: t('common:cancel'),
      destructive: true,
    })
    if (!ok) return
    const store = useReceiveDraft.getState()
    if (store.saving || store.ctx?.formSlug !== formSlug) return
    await store.discard()
    if (isNew) latest.current.nav.finishToList()
    else if (form && ctx) await store.load(ctx, form)
    if (mounted.current) latest.current.onDiscarded?.()
  }, [t, isNew, formSlug, form, ctx])

  const idle = ready && !saving && !writing
  // Phiếu mới: chỉ khi đã nhập gì (bản trắng không có gì để bỏ).
  const hasLocalChanges = idle && dirty
  const canDelete = idle && !isNew && !!abilities?.canDelete
  const pressDiscard = useCallback(() => void discard(), [discard])
  const pressDelete = useCallback(() => void latest.current.remove(), [])
  return useMemo(
    () => [
      ...(hasLocalChanges
        ? [
            {
              id: 'discard',
              label: t(
                isNew ? 'importForms:receive.menu.discardNew' : 'importForms:receive.menu.discard',
              ),
              destructive: true,
              onPress: pressDiscard,
            },
          ]
        : []),
      ...(canDelete
        ? [
            {
              id: 'delete',
              label: t('importForms:manage.deleteItem'),
              destructive: true,
              onPress: pressDelete,
            },
          ]
        : []),
    ],
    [t, hasLocalChanges, canDelete, isNew, pressDiscard, pressDelete],
  )
}
