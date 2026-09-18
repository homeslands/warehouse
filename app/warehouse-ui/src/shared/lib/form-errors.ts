import type { FieldValues, Path, UseFormReturn } from 'react-hook-form'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from './api-error-message'

/**
 * Lỗi backend thuộc về một ô (tên trùng, sai mật khẩu hiện tại) → hiện dưới ô đó, không toast.
 * Trả `true` nếu đã đưa lỗi vào form; `false` thì bên gọi tự `toastApiError(error)`.
 * Mutation dùng hàm này phải đặt `meta: { suppressErrorToast: true }`, nếu không handler global
 * toast thêm một lần nữa.
 */
export function applyApiErrorToForm<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: unknown,
  fieldByCode: Partial<Record<number, Path<T>>>,
): boolean {
  if (!isApiError(error) || error.code === undefined) return false
  const field = fieldByCode[error.code]
  if (field === undefined) return false
  form.setError(
    field,
    { type: 'server', message: resolveApiErrorMessage(error) },
    { shouldFocus: true },
  )
  return true
}
