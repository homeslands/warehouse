import { useCallback, useMemo } from 'react'

import { useExportDraft, type Shortage } from '@/features/export-draft'
import { useFormNotice } from '@/shared/lib/form-notice.store'

import { noticeShortages } from './useExportActions'

export type ExportStepNotices = {
  /** Thông báo mức phiếu của store dùng chung (thấy ở mọi bước của đúng phiếu). */
  formNotice: string | null
  /**
   * Dòng thiếu hàng kèm thông báo đó (bước 2 tô thẻ): khoá dòng → chi tiết ("Thiếu n" / "Lô chỉ còn
   * n", chỉ khi dòng còn y như lúc dò) hoặc `true` (chỉ biết khoá → "Không đủ hàng").
   */
  shortages: ReadonlyMap<string, Shortage | true>
  /** Thông báo riêng của màn (`extra`, vd mã quét không khớp ở bước 2). */
  screenNotice: string | null
  /** Đóng thông báo = bỏ cả hai (store của đúng phiếu và `extra`). */
  dismiss: () => void
}

/**
 * Khối thông báo mức phiếu dùng chung cho các bước phiếu xuất: `useFormNotice` của đúng ('export',
 * `formSlug`) TRƯỚC — mọi lỗi / báo của `useExportActions` đi qua đó — rồi `extra` của màn. Màn vẽ bằng
 * `ExportStepNotices` (testID riêng cho từng thông báo).
 */
export function useExportStepNotices(
  formSlug: string,
  extra?: { message: string | null; dismiss: () => void },
): ExportStepNotices {
  const notice = useFormNotice((s) =>
    s.notice?.kind === 'export' && s.notice.formSlug === formSlug ? s.notice : null,
  )
  const lines = useExportDraft((s) => s.draft?.lines)
  const shortages = useMemo(() => noticeShortages(notice, lines), [notice, lines])
  const dismissExtra = extra?.dismiss
  const dismiss = useCallback(() => {
    useFormNotice.getState().dismiss('export', formSlug)
    dismissExtra?.()
  }, [formSlug, dismissExtra])
  return {
    formNotice: notice?.message ?? null,
    shortages,
    screenNotice: extra?.message ?? null,
    dismiss,
  }
}
