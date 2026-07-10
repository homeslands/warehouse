import { toast } from 'sonner'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from './api-error-message'

/**
 * 401 (ngoài đăng nhập) đã dẫn tới logout + chuyển trang ở `main.tsx`. Một toast nữa chỉ là nhiễu
 * trên đường người dùng bị đá ra.
 */
export function toastApiError(error: unknown): void {
  if (isApiError(error) && error.statusCode === 401) return
  toast.error(resolveApiErrorMessage(error))
}
