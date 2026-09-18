import { z } from 'zod'

// Message là KHOÁ i18n; dialog dịch qua t(). Không thêm luật độ dài: backend chỉ yêu cầu không rỗng.
export type ChangePasswordErrorKey =
  | 'auth:changePassword.currentPasswordRequired'
  | 'auth:changePassword.newPasswordRequired'
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
      .min(1, 'auth:changePassword.newPasswordRequired' satisfies ChangePasswordErrorKey),
    confirmNewPassword: z
      .string()
      .min(1, 'auth:changePassword.confirmNewPasswordRequired' satisfies ChangePasswordErrorKey),
  })
  .refine((v) => v.confirmNewPassword === '' || v.confirmNewPassword === v.newPassword, {
    message: 'auth:changePassword.mismatch' satisfies ChangePasswordErrorKey,
    path: ['confirmNewPassword'],
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
