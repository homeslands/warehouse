import { toast } from 'sonner'
import { isApiError, isPermissionDenied } from '@/shared/api/http'
import { resolveApiErrorMessage } from './api-error-message'

/**
 * 401 đã được interceptor xử lý (refresh hoặc kết thúc phiên, màn login hiện lý do) — toast thêm
 * chỉ là nhiễu.
 */
export function toastApiError(error: unknown): void {
  if (isApiError(error) && error.statusCode === 401) return
  // Quyền vừa đổi thì mọi request đang bay tới endpoint bị thu quyền đều 403 cùng lúc (một màn có
  // vài query). `id` cố định để sonner gộp chúng thành MỘT toast thay vì xếp chồng.
  if (isPermissionDenied(error)) {
    toast.error(resolveApiErrorMessage(error), { id: 'permission-denied' })
    return
  }
  toast.error(resolveApiErrorMessage(error))
}
