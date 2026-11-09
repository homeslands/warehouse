import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  cancelExportForm,
  confirmExportForm,
  exportFormErrorMessage,
  exportFormKeys,
  isStaleExportFormError,
  type ExportForm,
} from '@/entities/export-form'
import { inventoryKeys } from '@/entities/inventory'
import { formatMoney } from '@/shared/lib/format'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import { haptics } from '@/shared/lib/haptics'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useGuardedAction } from '@/shared/lib/useGuardedAction'

export type ExportDecision = 'confirm' | 'cancel'

/**
 * Xác nhận / huỷ phiếu xuất từ màn xem: hỏi lại bằng `confirmAction`, gửi `{ version }`, rồi làm mới
 * cả nhánh phiếu xuất của kho (danh sách + chi tiết) và tồn kho (xác nhận trừ tồn, huỷ nhả phần giữ
 * chỗ). Ở lại màn: nhãn trạng thái đổi, nút biến mất. Cả luồng chạy trong MỘT `useGuardedAction` nên
 * bấm đôi / bấm cả hai nút đều bị bỏ qua; lỗi hiện ở mức phiếu (`useFormNotice`, như form 3 bước), phiếu đã đổi → tải lại.
 */
export function useExportDecision(warehouseSlug: string | undefined, form: ExportForm | undefined) {
  const { t, i18n } = useTranslation('exportForms')
  const queryClient = useQueryClient()
  const locale = i18n.language === 'en' ? 'en' : 'vi'
  const [busy, setBusy] = useState<ExportDecision | null>(null)
  /** Lần chạy hiện tại — `onError` cần biết để chọn câu lỗi riêng của "xác nhận phiếu xuất huỷ". */
  const current = useRef<{ kind: ExportDecision; disposal: boolean } | null>(null)

  /** Rời màn khi yêu cầu còn bay: lỗi về sau không được đẩy thông báo cũ vào store toàn cục. */
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refresh = (wh: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: exportFormKeys.warehouse(wh) }),
      queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouse(wh) }),
    ])

  const guard = useGuardedAction(
    async (kind: ExportDecision) => {
      if (!warehouseSlug || !form) return
      const wh = warehouseSlug
      const lines = form.items?.length ?? 0
      current.current = { kind, disposal: form.type === 'DISPOSAL' }
      useFormNotice.getState().dismiss('export', form.slug)
      const confirmed = await confirmAction(
        kind === 'confirm'
          ? {
              title: t('decision.confirmTitle', { code: form.code }),
              message: t('decision.confirmMessage', {
                lines,
                total: formatMoney(form.totalAmount, locale),
              }),
              confirmLabel: t('decision.confirmLabel'),
              cancelLabel: t('decision.review'),
            }
          : {
              title: t('decision.cancelTitle', { code: form.code }),
              message: t(
                form.status === 'PENDING'
                  ? 'decision.cancelPendingMessage'
                  : 'decision.cancelDraftMessage',
              ),
              confirmLabel: t('decision.cancelLabel'),
              cancelLabel: t('decision.keep'),
              destructive: true,
            },
      )
      if (!confirmed) return
      setBusy(kind)
      try {
        await (kind === 'confirm' ? confirmExportForm : cancelExportForm)(
          wh,
          form.slug,
          form.version,
        )
        haptics.success()
        // Chờ làm mới xong: trong lúc đó nút vẫn khoá, tránh gửi lần hai với `version` cũ.
        await refresh(wh)
      } finally {
        setBusy(null)
      }
    },
    {
      onError: (e) => {
        haptics.error()
        if (form && mounted.current) {
          useFormNotice.getState().show({
            kind: 'export',
            formSlug: form.slug,
            message: exportFormErrorMessage(e, t, {
              disposalConfirm: current.current?.kind === 'confirm' && current.current.disposal,
            }),
          })
        }
        // Phiếu đã đổi / không còn: thông báo nói "đã tải lại bản mới nhất" — tải thật.
        if (warehouseSlug && isStaleExportFormError(e)) void refresh(warehouseSlug)
      },
    },
  )

  const run = async (kind: ExportDecision) => {
    // Thành công hoặc người dùng không đồng ý ở hộp hỏi đều giữ khoá của `useGuardedAction`; mở lại
    // để lần sau (phiếu vẫn còn nút) bấm được.
    if (await guard.run(kind)) guard.reset()
  }

  return {
    busy,
    /** Có thao tác đang chạy (kể cả lúc hộp hỏi đang mở). */
    pending: guard.pending,
    confirm: () => void run('confirm'),
    cancel: () => void run('cancel'),
  }
}
