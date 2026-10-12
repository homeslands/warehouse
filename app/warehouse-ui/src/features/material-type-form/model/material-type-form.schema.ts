import { z } from 'zod'
import { BUSINESS_CODE_REGEX } from '@/shared/lib/code'
import type {
  MaterialType,
  MaterialTypeInput,
  MaterialTypeUpdateInput,
} from '@/entities/material-type'

const TEXT_MAX = 255

export const materialTypeFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'materialTypes:codeRequired')
    .regex(BUSINESS_CODE_REGEX, 'materialTypes:codeInvalid'),
  name: z
    .string()
    .trim()
    .min(1, 'materialTypes:nameRequired')
    .max(TEXT_MAX, 'materialTypes:tooLong'),
  description: z.string().max(TEXT_MAX, 'materialTypes:tooLong'),
})

export type MaterialTypeFormValues = z.input<typeof materialTypeFormSchema>

export const EMPTY_MATERIAL_TYPE_FORM: MaterialTypeFormValues = {
  code: '',
  name: '',
  description: '',
}

export function toCreateInput(values: MaterialTypeFormValues): MaterialTypeInput {
  const input: MaterialTypeInput = { code: values.code.trim(), name: values.name.trim() }
  const description = values.description.trim()
  if (description !== '') input.description = description
  return input
}

/** Chỉ trường đã đổi. Mô tả xoá trống → gửi `''` (cách duy nhất để xoá). */
export function toUpdateInput(
  values: MaterialTypeFormValues,
  original: MaterialType,
): MaterialTypeUpdateInput {
  const input: MaterialTypeUpdateInput = {}
  if (values.code.trim() !== original.code) input.code = values.code.trim()
  if (values.name.trim() !== original.name) input.name = values.name.trim()
  const description = values.description.trim()
  if (description !== (original.description ?? '')) input.description = description
  return input
}

export function toFormValues(type: MaterialType): MaterialTypeFormValues {
  return { code: type.code, name: type.name, description: type.description ?? '' }
}
