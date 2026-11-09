import { z } from 'zod'

// Chép từ web (`warehouse-ui/src/features/auth-login/model/login.schema.ts`).
// Ô số điện thoại chỉ nhận chữ số (LoginForm lọc trước khi lưu); schema chỉ kiểm bắt buộc như web.
// Message là KHOÁ i18n, không phải câu hoàn chỉnh — LoginForm dịch qua t().
export type LoginErrorKey = 'auth:phonenumberRequired' | 'auth:passwordRequired'

export const loginSchema = z.object({
  phonenumber: z.string().min(1, 'auth:phonenumberRequired' satisfies LoginErrorKey),
  password: z.string().min(1, 'auth:passwordRequired' satisfies LoginErrorKey),
})

export type LoginInput = z.infer<typeof loginSchema>
