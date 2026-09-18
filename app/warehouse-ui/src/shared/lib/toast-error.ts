import { toast } from 'sonner'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from './api-error-message'

/**
 * 401 đã được interceptor xử lý (refresh hoặc kết thúc phiên, màn login hiện lý do) — toast thêm
 * chỉ là nhiễu.
 */
export function toastApiError(error: unknown): void {
  if (isApiError(error) && error.statusCode === 401) return
  toast.error(resolveApiErrorMessage(error))
}
