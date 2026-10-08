import { z } from 'zod'
import { meetsMinPasswordLength } from '@/shared/lib/password-policy'

// Message là KHOÁ i18n. Độ dài tối thiểu là lớp chặn tạm — xem `shared/lib/password-policy.ts`.
export type ResetPasswordErrorKey =
  | 'errors:newPasswordIsRequired'
  | 'users:passwordTooShort'
  | 'users:confirmPasswordRequired'
  | 'users:passwordMismatch'

export const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(1, 'errors:newPasswordIsRequired' satisfies ResetPasswordErrorKey)
      .refine(meetsMinPasswordLength, 'users:passwordTooShort' satisfies ResetPasswordErrorKey),
    confirmNewPassword: z
      .string()
      .min(1, 'users:confirmPasswordRequired' satisfies ResetPasswordErrorKey),
  })
  .refine((v) => v.confirmNewPassword === '' || v.confirmNewPassword === v.newPassword, {
    message: 'users:passwordMismatch' satisfies ResetPasswordErrorKey,
    path: ['confirmNewPassword'],
  })

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
