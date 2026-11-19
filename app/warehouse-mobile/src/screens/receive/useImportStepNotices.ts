import { useCallback } from 'react'

import { useFormNotice } from '@/shared/lib/form-notice.store'

export type ImportStepNotices = {
  /** Thông báo mức phiếu của store dùng chung (thấy ở mọi bước của đúng phiếu). */
  formNotice: string | null
  /** Thông báo riêng của màn (`extra`, vd mã quét không khớp ở bước 2). */
  screenNotice: string | null
  /** Nút gỡ rối dưới thông báo của màn (vd "Tạo vật tư <mã>"). */
  screenAction?: { label: string; onPress: () => void }
  /** Đóng thông báo = bỏ cả hai (store của đúng phiếu và `extra`). */
  dismiss: () => void
}

/**
 * Khối thông báo mức phiếu dùng chung cho các bước phiếu nhập: `useFormNotice` của đúng ('import',
 * `formSlug`) TRƯỚC — gộp sau lệch version và MỌI lỗi / báo của `useReceiveActions` (luồng soạn) —, rồi
 * `extra` của màn. Màn vẽ bằng `ImportStepNotices` (testID riêng cho từng thông báo).
 */
export function useImportStepNotices(
  formSlug: string,
  extra?: {
    message: string | null
    dismiss: () => void
    action?: { label: string; onPress: () => void }
  },
): ImportStepNotices {
  const notice = useFormNotice((s) =>
    s.notice?.kind === 'import' && s.notice.formSlug === formSlug ? s.notice : null,
  )
  const dismissExtra = extra?.dismiss
  const dismiss = useCallback(() => {
    useFormNotice.getState().dismiss('import', formSlug)
    dismissExtra?.()
  }, [formSlug, dismissExtra])
  return {
    formNotice: notice?.message ?? null,
    screenNotice: extra?.message ?? null,
    screenAction: extra?.action,
    dismiss,
  }
}
