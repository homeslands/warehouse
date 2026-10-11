import { z } from 'zod'
import type { RoleInput } from '@/entities/user'

const NAME_MAX = 50
const TEXT_MAX = 255
const norm = (value: string) => value.trim().toLocaleLowerCase('vi')

/**
 * Schema form TẠO vai trò. `maxLevel`: cấp cao nhất được tạo (`maxCreatableLevel`), `0` = không tạo được.
 * `takenNames`: mã + nhãn vi/en của vai trò có sẵn và tên các vai trò đang có — so không phân biệt hoa thường
 * (backend so đúng chuỗi; FE chặt hơn để không có hai vai trò "Quản lý" / "quản lý").
 */
export function makeRoleCreateSchema({
  maxLevel,
  takenNames,
}: {
  maxLevel: number
  takenNames: readonly string[]
}) {
  const taken = new Set(takenNames.map(norm))
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, 'roles:nameRequired')
      .min(2, 'roles:nameTooShort')
      .max(NAME_MAX, 'roles:nameTooLong')
      .refine((value) => !taken.has(norm(value)), 'roles:nameTaken'),
    // `NumberInput` trả `undefined` khi ô trống — giữ kiểu đó để báo "bắt buộc" thay vì lỗi kiểu của Zod.
    level: z
      .number()
      .optional()
      .superRefine((value, ctx) => {
        if (value === undefined) {
          ctx.addIssue({ code: 'custom', message: 'roles:levelRequired' })
        } else if (!Number.isInteger(value) || value < 1) {
          ctx.addIssue({ code: 'custom', message: 'roles:levelInvalid' })
        } else if (value > maxLevel) {
          ctx.addIssue({ code: 'custom', message: 'roles:levelTooHigh' })
        }
      }),
    description: z.string().max(TEXT_MAX, 'roles:descriptionTooLong'),
  })
}

export type RoleCreateValues = z.input<ReturnType<typeof makeRoleCreateSchema>>

export const EMPTY_ROLE_FORM: RoleCreateValues = { name: '', level: undefined, description: '' }

/** Form SỬA: backend chỉ sửa được mô tả. */
export const roleEditSchema = z.object({
  description: z.string().max(TEXT_MAX, 'roles:descriptionTooLong'),
})

export type RoleEditValues = z.input<typeof roleEditSchema>

/** Body `POST /roles`: trim tên + mô tả, bỏ mô tả trống. Chỉ gọi sau khi schema đã chấp nhận (`level` có giá trị). */
export function toCreateInput(values: RoleCreateValues): RoleInput {
  const input: RoleInput = { name: values.name.trim(), level: values.level as number }
  const description = values.description.trim()
  if (description !== '') input.description = description
  return input
}
