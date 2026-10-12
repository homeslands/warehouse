import { z } from 'zod'
import { BUSINESS_CODE_REGEX } from '@/shared/lib/code'
import { DECIMAL_18_6_LIMIT, hasAtMostDecimals } from '@/shared/lib/number'
import type { Material, MaterialInput, MaterialUpdateInput } from '@/entities/material'

const TEXT_MAX = 255

/**
 * Ngưỡng tồn: trống (`undefined`) = 0; ≥ 0, ≤ 6 số lẻ — khớp `IsDecimalWithScale(6)` + `@Min(0)` của backend — và
 * dưới trần `DECIMAL(18,6)`.
 */
const inventory = z
  .number({ error: 'materials:inventoryInvalid' })
  .refine((v) => v >= 0 && hasAtMostDecimals(v, 6), 'materials:inventoryInvalid')
  .refine((v) => v < DECIMAL_18_6_LIMIT, 'materials:inventoryTooLarge')
  .optional()

export const materialFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, 'materials:codeRequired')
      .regex(BUSINESS_CODE_REGEX, 'materials:codeInvalid'),
    name: z.string().trim().min(1, 'materials:nameRequired').max(TEXT_MAX, 'materials:tooLong'),
    typeSlug: z.string().min(1, 'materials:typeRequired'),
    baseUnitSlug: z.string().min(1, 'materials:baseUnitRequired'),
    minimumInventory: inventory,
    maximumInventory: inventory,
  })
  .refine((v) => (v.maximumInventory ?? 0) >= (v.minimumInventory ?? 0), {
    path: ['maximumInventory'],
    message: 'materials:maximumBelowMinimum',
  })

export type MaterialFormValues = z.input<typeof materialFormSchema>

export const EMPTY_MATERIAL_FORM: MaterialFormValues = {
  code: '',
  name: '',
  typeSlug: '',
  baseUnitSlug: '',
  minimumInventory: undefined,
  maximumInventory: undefined,
}

export function toCreateInput(values: MaterialFormValues): MaterialInput {
  const input: MaterialInput = {
    code: values.code.trim(),
    name: values.name.trim(),
    typeSlug: values.typeSlug,
    baseUnitSlug: values.baseUnitSlug,
  }
  if (values.minimumInventory !== undefined) input.minimumInventory = values.minimumInventory
  if (values.maximumInventory !== undefined) input.maximumInventory = values.maximumInventory
  return input
}

/** Chỉ trường đã đổi. Ngưỡng xoá trống = 0 (cùng nghĩa với mặc định của backend). */
export function toUpdateInput(values: MaterialFormValues, original: Material): MaterialUpdateInput {
  const input: MaterialUpdateInput = {}
  if (values.code.trim() !== original.code) input.code = values.code.trim()
  if (values.name.trim() !== original.name) input.name = values.name.trim()
  if (values.typeSlug !== original.type.slug) input.typeSlug = values.typeSlug
  if (values.baseUnitSlug !== (original.baseUnit?.slug ?? ''))
    input.baseUnitSlug = values.baseUnitSlug
  const min = values.minimumInventory ?? 0
  const max = values.maximumInventory ?? 0
  if (min !== original.minimumInventory) input.minimumInventory = min
  if (max !== original.maximumInventory) input.maximumInventory = max
  return input
}

export function toFormValues(material: Material): MaterialFormValues {
  return {
    code: material.code,
    name: material.name,
    typeSlug: material.type.slug,
    baseUnitSlug: material.baseUnit?.slug ?? '',
    minimumInventory: material.minimumInventory,
    maximumInventory: material.maximumInventory,
  }
}
