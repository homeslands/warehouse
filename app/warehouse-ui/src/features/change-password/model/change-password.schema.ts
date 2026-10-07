import { z } from 'zod'
import { meetsMinPasswordLength } from '@/shared/lib/password-policy'

// Message là KHOÁ i18n; dialog dịch qua t(). Độ dài tối thiểu của mật khẩu MỚI là lớp chặn tạm — xem
// `shared/lib/password-policy.ts` (mật khẩu hiện tại không xét độ dài: tài khoản cũ có thể đang dùng mật khẩu ngắn).
export type ChangePasswordErrorKey =
  | 'auth:changePassword.currentPasswordRequired'
  | 'auth:changePassword.newPasswordRequired'
  | 'auth:changePassword.newPasswordTooShort'
  | 'auth:changePassword.confirmNewPasswordRequired'
  | 'auth:changePassword.mismatch'

/** Sai mật khẩu hiện tại — backend trả 422 kèm mã này. */
export const CURRENT_PASSWORD_INCORRECT_CODE = 100013

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'auth:changePassword.currentPasswordRequired' satisfies ChangePasswordErrorKey),
    newPassword: z
      .string()
      .min(1, 'auth:changePassword.newPasswordRequired' satisfies ChangePasswordErrorKey)
      .refine(
        meetsMinPasswordLength,
        'auth:changePassword.newPasswordTooShort' satisfies ChangePasswordErrorKey,
      ),
    confirmNewPassword: z
      .string()
      .min(1, 'auth:changePassword.confirmNewPasswordRequired' satisfies ChangePasswordErrorKey),
  })
  .refine((v) => v.confirmNewPassword === '' || v.confirmNewPassword === v.newPassword, {
    message: 'auth:changePassword.mismatch' satisfies ChangePasswordErrorKey,
    path: ['confirmNewPassword'],
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
