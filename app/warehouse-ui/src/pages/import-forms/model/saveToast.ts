import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import type { ImportFormSaveOutcome } from '@/features/import-form-editor'

/**
 * Toast báo kết quả lưu của sheet phiếu nhập — sheet và hook không tự báo thành công. Câu ngắn (toast hẹp, chữ dài
 * bị cắt): một dòng chính + tối đa một nút "Xem"; lý do xác nhận lỗi nằm ở dòng phụ.
 */
export function toastSaveOutcome(
  t: TFunction<'importForms'>,
  { form, confirmed, confirmError }: ImportFormSaveOutcome,
  creating: boolean,
  onView?: () => void,
) {
  const { code } = form
  const action = onView && { label: t('viewForm'), onClick: onView }
  if (confirmError !== undefined) {
    toast.warning(t('savedNotConfirmed', { code }), {
      description: resolveApiErrorMessage(confirmError),
      action,
    })
    return
  }
  if (!creating) {
    toast.success(t(confirmed ? 'savedAndConfirmed' : 'updated', { code }))
    return
  }
  toast.success(t(confirmed ? 'createdAndConfirmed' : 'createdWithCode', { code }), { action })
}
