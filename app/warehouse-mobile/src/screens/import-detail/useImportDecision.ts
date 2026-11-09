import { useQueryClient } from '@tanstack/react-query'
import { useNavigation, useRouter } from 'expo-router'
import { StackActions } from 'expo-router/react-navigation'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  cancelImportForm,
  deleteImportForm,
  importFormErrorMessage,
  importFormKeys,
  isImportFormNotFoundError,
  isStaleImportFormError,
  type ImportForm,
} from '@/entities/import-form'
import { dropLocalDraft, hasLocalWork } from '@/features/receive-checklist'
import { isVersionConflict } from '@/shared/api/http'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import { haptics } from '@/shared/lib/haptics'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useGuardedAction } from '@/shared/lib/useGuardedAction'

export type ImportDecision = 'cancel' | 'delete'

/**
 * Huỷ / xoá phiếu nhập Nháp từ `⋯` của màn xem (khuôn `useExportDecision`). Cả luồng (đọc bản nháp
 * trên máy → hỏi lại → gửi) chạy trong MỘT `useGuardedAction` nên bấm đôi / bấm cả hai mục đều bị bỏ
 * qua; lỗi hiện ở mức phiếu (`useFormNotice`, `kind: 'import'`), phiếu đã đổi / không còn Nháp → tải
 * lại. Hộp hỏi nối câu nhắc khi trên máy còn bản nháp dở của phiếu (`hasLocalWork`: có dòng đã kiểm hoặc khác phiếu).
 *
 * - Huỷ: POST `{ version }` → chờ làm mới cả nhánh phiếu nhập của kho (tồn không đổi) → ở lại màn (nhãn
 *   "Đã huỷ", hết mục) → bỏ bản nháp trên máy.
 * - Xoá: DELETE (404 = đã bị xoá ở nơi khác → như xoá xong) → huỷ lần tải chi tiết đang bay → về danh
 *   sách (`popToTop` Stack tab) → làm mới CHỈ nhánh danh sách → bỏ bản nháp trên máy. Không invalidate /
 *   refetch chi tiết (sẽ 404 → màn lỗi trong lúc màn đang đóng); cache chi tiết bị bỏ khi màn tháo ra.
 */
export function useImportDecision({
  form,
  warehouseSlug,
  userSlug,
}: {
  form: ImportForm | undefined
  warehouseSlug: string | undefined
  userSlug: string | null
}) {
  const { t } = useTranslation(['importForms', 'errors', 'common'])
  const queryClient = useQueryClient()
  const navigation = useNavigation()
  const router = useRouter()
  const [busy, setBusy] = useState<ImportDecision | null>(null)
  /** Đã xoá và đang rời màn: giữ khoá + `busy` tới khi màn đóng. */
  const left = useRef(false)
  /** Phiếu vừa xoá: khi màn tháo ra thì bỏ cache chi tiết của nó (không còn trên server). */
  const [deleted, setDeleted] = useState<{ wh: string; slug: string } | null>(null)

  /** Rời màn khi yêu cầu còn bay: lỗi về sau không được đẩy thông báo cũ vào store toàn cục. */
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!deleted) return
    // Bỏ khi KHÔNG còn observer: bỏ lúc màn còn gắn thì query dựng lại và tự tải (→ 404).
    return () =>
      queryClient.removeQueries({
        queryKey: importFormKeys.detail(deleted.wh, deleted.slug),
        exact: true,
      })
  }, [deleted, queryClient])

  const refresh = (wh: string) =>
    queryClient.invalidateQueries({ queryKey: importFormKeys.warehouse(wh) })

  /** Về danh sách phiếu nhập: bỏ màn xem (và mọi màn trên nó) khỏi Stack của tab. */
  const toList = () => {
    const state = navigation.getState()
    if (state && state.index > 0) navigation.dispatch(StackActions.popToTop())
    // Màn xem nằm đáy Stack (không có danh sách dưới — `anchor` thường đã đặt): thay bằng danh sách.
    else router.replace('/import')
  }

  const guard = useGuardedAction(
    async (kind: ImportDecision) => {
      if (!warehouseSlug || !form || !userSlug) return
      const wh = warehouseSlug
      const slug = form.slug
      const ctx = { userSlug, warehouseSlug: wh, formSlug: slug }
      useFormNotice.getState().dismiss('import', slug)
      // Đọc lúc mở hộp: bản nháp có thể vừa được lưu / bỏ ở màn kiểm.
      const hasLocal = await hasLocalWork(ctx, form)
      const note = hasLocal ? `\n\n${t('importForms:manage.discardLocalNote')}` : ''
      const confirmed = await confirmAction(
        kind === 'cancel'
          ? {
              title: t('importForms:manage.cancelTitle', { code: form.code }),
              message: t('importForms:manage.cancelMessage') + note,
              confirmLabel: t('importForms:manage.cancelLabel'),
              cancelLabel: t('importForms:manage.cancelKeep'),
              destructive: true,
            }
          : {
              title: t('importForms:manage.deleteTitle', { code: form.code }),
              message: t('importForms:manage.deleteMessage', { code: form.code }) + note,
              confirmLabel: t('importForms:manage.deleteLabel'),
              cancelLabel: t('importForms:manage.deleteKeep'),
              destructive: true,
            },
      )
      if (!confirmed) return
      setBusy(kind)

      if (kind === 'cancel') {
        try {
          await cancelImportForm(wh, slug, form.version)
          haptics.success()
          // Chờ làm mới xong: trong lúc đó menu vẫn khoá, tránh gửi lần hai với `version` cũ.
          await refresh(wh)
        } finally {
          setBusy(null)
        }
        await dropLocalDraft(ctx)
        return
      }

      try {
        await deleteImportForm(wh, slug)
      } catch (e) {
        // Đã bị xoá ở nơi khác: kết quả như xoá xong.
        if (!isImportFormNotFoundError(e)) {
          setBusy(null)
          throw e
        }
      }
      left.current = true
      setDeleted({ wh, slug })
      const detailKey = importFormKeys.detail(wh, slug)
      // Lần tải chi tiết đang bay (kéo làm mới…) sẽ về 404 → màn lỗi: huỷ (cache giữ bản cũ).
      await queryClient.cancelQueries({ queryKey: detailKey, exact: true })
      haptics.success()
      if (mounted.current) toList()
      // Chỉ danh sách: chi tiết (màn xem đang đóng) sẽ 404 nếu tải lại.
      void queryClient.invalidateQueries({ queryKey: [...importFormKeys.warehouse(wh), 'list'] })
      await dropLocalDraft(ctx)
    },
    {
      onError: (e) => {
        haptics.error()
        if (form && mounted.current) {
          useFormNotice.getState().show({
            kind: 'import',
            formSlug: form.slug,
            // Lệch version: đã tải lại thật (dưới) → câu "đã tải lại bản mới nhất".
            message: isVersionConflict(e)
              ? t('importForms:conflict')
              : importFormErrorMessage(e, t),
          })
        }
        if (warehouseSlug && isStaleImportFormError(e)) void refresh(warehouseSlug)
      },
    },
  )

  const run = async (kind: ImportDecision) => {
    // Huỷ xong / không đồng ý ở hộp hỏi đều giữ khoá của `useGuardedAction` → mở lại. Xoá xong thì
    // giữ khoá (màn đang đóng).
    if ((await guard.run(kind)) && !left.current) guard.reset()
  }

  return {
    busy,
    /** Có thao tác đang chạy (kể cả lúc đọc bản nháp / hộp hỏi đang mở, và sau khi xoá xong). */
    pending: guard.pending,
    cancel: () => void run('cancel'),
    remove: () => void run('delete'),
  }
}
