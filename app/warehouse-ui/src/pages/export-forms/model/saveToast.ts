import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import type { ExportFormSaveOutcome } from '@/features/export-form-editor'

const SUCCESS = {
  draft: 'toastDraftSaved',
  submitted: 'toastSubmitted',
  confirmed: 'toastExported',
} as const

/**
 * Toast báo kết quả lưu của sheet phiếu xuất — sheet và hook không tự báo thành công. Câu ngắn: một dòng chính + tối
 * đa một nút "Xem" (chỉ khi tạo, hoặc khi cảnh báo); lý do bước sau lỗi (gửi duyệt / xác nhận) nằm ở dòng phụ.
 * `creating`: phiếu do lần mở sheet này tạo ra — sửa nháp bằng "Lưu" chỉ báo ngắn "Đã lưu <mã>".
 */
export function toastExportSaveOutcome(
  t: TFunction<'exportForms'>,
  { form, stage, error }: ExportFormSaveOutcome,
  creating: boolean,
  onView?: () => void,
) {
  const { code } = form
  const action = onView && { label: t('toastViewForm'), onClick: onView }
  if (error !== undefined) {
    // Lưu được tới `stage` rồi bước kế tiếp hỏng: nháp → chưa gửi duyệt; đã gửi → chưa xác nhận.
    const key = stage === 'draft' ? 'toastSavedNotSubmitted' : 'toastSubmittedNotConfirmed'
    toast.warning(t(key, { code }), { description: resolveApiErrorMessage(error), action })
    return
  }
  if (!creating && stage === 'draft') {
    toast.success(t('toastUpdated', { code }))
    return
  }
  toast.success(t(SUCCESS[stage], { code }), creating ? { action } : undefined)
}
