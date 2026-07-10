import { z } from 'zod'

// KHÔNG dùng z.string().email(): backend đăng nhập bằng phonenumber.
// KHÔNG ép định dạng số: tài khoản seed có phonenumber = "root".
export const loginSchema = z.object({
  phonenumber: z.string().min(1, 'Vui lòng nhập số điện thoại'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
})

export type LoginInput = z.infer<typeof loginSchema>
