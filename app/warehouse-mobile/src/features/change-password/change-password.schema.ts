import { z } from 'zod'

// Chép từ web (`warehouse-ui/src/features/change-password/model/change-password.schema.ts`).
// Message là KHOÁ i18n; sheet dịch qua t(). Độ dài tối thiểu chỉ áp cho mật khẩu MỚI (tài khoản cũ có
// thể đang dùng mật khẩu ngắn). `sameAsCurrent` là luật thêm của mobile (đổi mà không đổi là vô nghĩa).
export type ChangePasswordErrorKey =
  | 'auth:changePassword.currentPasswordRequired'
  | 'auth:changePassword.newPasswordRequired'
  | 'auth:changePassword.newPasswordTooShort'
  | 'auth:changePassword.confirmNewPasswordRequired'
  | 'auth:changePassword.mismatch'
  | 'auth:changePassword.sameAsCurrent'

export const MIN_PASSWORD_LENGTH = 8

/** Sai mật khẩu hiện tại — backend `CURRENT_PASSWORD_INCORRECT` (422). */
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
        (v) => v === '' || v.length >= MIN_PASSWORD_LENGTH,
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
  .refine(
    (v) =>
      v.currentPassword === '' ||
      v.newPassword.length < MIN_PASSWORD_LENGTH ||
      v.newPassword !== v.currentPassword,
    {
      message: 'auth:changePassword.sameAsCurrent' satisfies ChangePasswordErrorKey,
      path: ['newPassword'],
    },
  )

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
