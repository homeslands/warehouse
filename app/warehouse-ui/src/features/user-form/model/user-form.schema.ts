import { format } from 'date-fns'
import { z } from 'zod'
import { meetsMinPasswordLength } from '@/shared/lib/password-policy'
import type { User, UserInput, UserUpdateInput } from '@/entities/user'

// Message là KHOÁ i18n; sheet dịch qua t().
export type UserFormErrorKey =
  | 'users:phonenumberRequired'
  | 'users:phonenumberInvalid'
  | 'users:lastNameRequired'
  | 'users:firstNameRequired'
  | 'users:passwordRequired'
  | 'users:passwordTooShort'
  | 'users:confirmPasswordRequired'
  | 'users:passwordMismatch'
  | 'users:roleRequired'
  | 'users:dobFuture'
  | 'users:emailInvalid'
  | 'users:tooLong'

/** Đúng `VN_PHONENUMBER_REGEX` của backend (`CreateUserRequestDto.phonenumber`). */
const PHONE_REGEX = /^0[35789][0-9]{8}$/
const emailSchema = z.email()
/** Cột chuỗi của backend là `varchar(255)` mặc định của TypeORM — backend chưa tự giới hạn. */
const TEXT_MAX = 255
const TOO_LONG = 'users:tooLong' satisfies UserFormErrorKey

/**
 * Validate ĐỦ mọi ô — backend chỉ trả lỗi validate đầu tiên. Mật khẩu chỉ cần không rỗng: quy ước hiện có
 * (`features/change-password`), backend chưa có chính sách độ dài (đã đề xuất trong proposal).
 *
 * Chế độ sửa: SĐT sửa được nhưng chỉ kiểm định dạng khi ĐÃ ĐỔI (`originalPhone`) — tài khoản cũ như `root` không
 * khớp regex mà vẫn phải lưu được các trường khác. Không có mật khẩu, không có vai trò (`.../change-role` riêng).
 * `today` là tham số để test cố định được "hôm nay".
 */
export function userFormSchema(
  mode: 'create' | 'edit',
  today: Date = new Date(),
  originalPhone?: string,
) {
  const todayValue = format(today, 'yyyy-MM-dd')
  const creating = mode === 'create'

  return z
    .object({
      phonenumber: creating
        ? z
            .string()
            .trim()
            .min(1, 'users:phonenumberRequired' satisfies UserFormErrorKey)
            .regex(PHONE_REGEX, 'users:phonenumberInvalid' satisfies UserFormErrorKey)
        : z
            .string()
            .trim()
            .min(1, 'users:phonenumberRequired' satisfies UserFormErrorKey)
            .refine(
              (v) => v === '' || v === originalPhone || PHONE_REGEX.test(v),
              'users:phonenumberInvalid' satisfies UserFormErrorKey,
            ),
      lastName: z
        .string()
        .trim()
        .min(1, 'users:lastNameRequired' satisfies UserFormErrorKey)
        .max(TEXT_MAX, TOO_LONG),
      firstName: z
        .string()
        .trim()
        .min(1, 'users:firstNameRequired' satisfies UserFormErrorKey)
        .max(TEXT_MAX, TOO_LONG),
      password: creating
        ? z
            .string()
            .min(1, 'users:passwordRequired' satisfies UserFormErrorKey)
            .refine(meetsMinPasswordLength, 'users:passwordTooShort' satisfies UserFormErrorKey)
        : z.string(),
      confirmPassword: creating
        ? z.string().min(1, 'users:confirmPasswordRequired' satisfies UserFormErrorKey)
        : z.string(),
      roleSlug: creating
        ? z.string().min(1, 'users:roleRequired' satisfies UserFormErrorKey)
        : z.string(),
      // `YYYY-MM-DD` so sánh chuỗi đúng thứ tự thời gian.
      dob: z
        .string()
        .optional()
        .refine((v) => !v || v <= todayValue, 'users:dobFuture' satisfies UserFormErrorKey),
      email: z
        .string()
        .max(TEXT_MAX, TOO_LONG)
        .refine(
          (v) => v.trim() === '' || emailSchema.safeParse(v.trim()).success,
          'users:emailInvalid' satisfies UserFormErrorKey,
        ),
      address: z.string().max(TEXT_MAX, TOO_LONG),
    })
    .refine((v) => !creating || v.confirmPassword === '' || v.confirmPassword === v.password, {
      message: 'users:passwordMismatch' satisfies UserFormErrorKey,
      path: ['confirmPassword'],
    })
}

export type UserFormValues = z.input<ReturnType<typeof userFormSchema>>

export const EMPTY_USER_FORM: UserFormValues = {
  phonenumber: '',
  lastName: '',
  firstName: '',
  password: '',
  confirmPassword: '',
  roleSlug: '',
  dob: undefined,
  email: '',
  address: '',
}

/** Trường tuỳ chọn trống → BỎ hẳn: `@IsEmail`/`@Matches` của backend không nhận `''`. */
export function toCreateInput(values: UserFormValues): UserInput {
  const email = values.email.trim()
  const address = values.address.trim()
  return {
    phonenumber: values.phonenumber.trim(),
    lastName: values.lastName.trim(),
    firstName: values.firstName.trim(),
    password: values.password,
    roleSlug: values.roleSlug,
    ...(values.dob ? { dob: values.dob } : {}),
    ...(email ? { email } : {}),
    ...(address ? { address } : {}),
  }
}

type EditableFields = Pick<
  User,
  'phonenumber' | 'firstName' | 'lastName' | 'dob' | 'email' | 'address'
>

/**
 * `PATCH` partial: chỉ gửi trường ĐÃ ĐỔI so với bản gốc (trim trước khi so). Backend lọc cả `null`
 * (`pickDefined`) nên chưa xoá trống được trường tuỳ chọn — ô tuỳ chọn để trống bị bỏ qua (giữ nguyên).
 * Không bao giờ gửi mật khẩu hay vai trò.
 */
export function toUpdateInput(values: UserFormValues, original: EditableFields): UserUpdateInput {
  const input: UserUpdateInput = {}
  const changed = (next: string, prev: string | null | undefined) => next !== (prev ?? '').trim()

  const phonenumber = values.phonenumber.trim()
  if (changed(phonenumber, original.phonenumber)) input.phonenumber = phonenumber
  const lastName = values.lastName.trim()
  if (changed(lastName, original.lastName)) input.lastName = lastName
  const firstName = values.firstName.trim()
  if (changed(firstName, original.firstName)) input.firstName = firstName

  const dob = values.dob ?? ''
  if (dob && changed(dob, original.dob)) input.dob = dob
  const email = values.email.trim()
  if (email && changed(email, original.email)) input.email = email
  const address = values.address.trim()
  if (address && changed(address, original.address)) input.address = address

  return input
}
