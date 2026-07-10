import { z } from 'zod'

// KHÔNG dùng z.string().email(): backend đăng nhập bằng phonenumber.
// KHÔNG ép định dạng số: tài khoản seed có phonenumber = "root".
// Message là KHOÁ i18n, không phải câu hoàn chỉnh. LoginPage dịch qua t().
export type LoginErrorKey = 'auth:phonenumberRequired' | 'auth:passwordRequired'

export const loginSchema = z.object({
  phonenumber: z.string().min(1, 'auth:phonenumberRequired' satisfies LoginErrorKey),
  password: z.string().min(1, 'auth:passwordRequired' satisfies LoginErrorKey),
})

export type LoginInput = z.infer<typeof loginSchema>
