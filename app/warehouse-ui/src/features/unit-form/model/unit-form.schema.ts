import { z } from 'zod'
import { UNIT_CODE_REGEX } from '@/shared/lib/code'
import type { Unit, UnitInput, UnitUpdateInput } from '@/entities/unit'

const TEXT_MAX = 255

export const unitFormSchema = z.object({
  code: z.string().trim().min(1, 'units:codeRequired').regex(UNIT_CODE_REGEX, 'units:codeInvalid'),
  name: z.string().trim().min(1, 'units:nameRequired').max(TEXT_MAX, 'units:tooLong'),
  description: z.string().max(TEXT_MAX, 'units:tooLong'),
})

export type UnitFormValues = z.input<typeof unitFormSchema>

export const EMPTY_UNIT_FORM: UnitFormValues = { code: '', name: '', description: '' }

export function toCreateInput(values: UnitFormValues): UnitInput {
  const input: UnitInput = { code: values.code.trim(), name: values.name.trim() }
  const description = values.description.trim()
  if (description !== '') input.description = description
  return input
}

/** Chỉ trường đã đổi. Mô tả xoá trống → gửi `''` (backend `pickDefined` giữ `''`, đó là cách duy nhất để xoá). */
export function toUpdateInput(values: UnitFormValues, original: Unit): UnitUpdateInput {
  const input: UnitUpdateInput = {}
  if (values.code.trim() !== original.code) input.code = values.code.trim()
  if (values.name.trim() !== original.name) input.name = values.name.trim()
  const description = values.description.trim()
  if (description !== (original.description ?? '')) input.description = description
  return input
}

export function toFormValues(unit: Unit): UnitFormValues {
  return { code: unit.code, name: unit.name, description: unit.description ?? '' }
}
