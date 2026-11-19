import type { Material, MaterialInput, MaterialRef, MaterialUpdateInput } from '@/entities/material'
import { BUSINESS_CODE_REGEX } from '@/shared/lib/code'
import { parseDecimalInput } from '@/shared/lib/format'

export type MaterialFormValues = {
  code: string
  name: string
  type: MaterialRef | null
  baseUnit: MaterialRef | null
  min: string
  max: string
}

export const EMPTY_MATERIAL_FORM: MaterialFormValues = {
  code: '',
  name: '',
  type: null,
  baseUnit: null,
  min: '',
  max: '',
}

export type MaterialField = 'code' | 'name' | 'type' | 'baseUnit' | 'min' | 'max'
export type MaterialFieldError =
  'required' | 'codeInvalid' | 'tooLong' | 'numberInvalid' | 'rangeInvalid'
export type MaterialFormErrors = Partial<Record<MaterialField, MaterialFieldError>>

const MAX_LENGTH = 255
const MAX_QUANTITY = 1e12

/** Trống = 0; sai định dạng hoặc ≥ 1e12 → `null`. */
function parseQuantity(text: string): number | null {
  if (text.trim() === '') return 0
  const n = parseDecimalInput(text)
  return n === null || n >= MAX_QUANTITY ? null : n
}

export function validateMaterialForm(v: MaterialFormValues): MaterialFormErrors {
  const errors: MaterialFormErrors = {}
  const code = v.code.trim()
  if (code === '') errors.code = 'required'
  else if (!BUSINESS_CODE_REGEX.test(code)) errors.code = 'codeInvalid'

  const name = v.name.trim()
  if (name === '') errors.name = 'required'
  else if (name.length > MAX_LENGTH) errors.name = 'tooLong'

  if (v.type === null) errors.type = 'required'
  if (v.baseUnit === null) errors.baseUnit = 'required'

  const min = parseQuantity(v.min)
  const max = parseQuantity(v.max)
  if (min === null) errors.min = 'numberInvalid'
  if (max === null) errors.max = 'numberInvalid'
  if (min !== null && max !== null && min > max) errors.max = 'rangeInvalid'
  return errors
}

export function toMaterialFormValues(m: Material): MaterialFormValues {
  return {
    code: m.code,
    name: m.name,
    type: m.type,
    baseUnit: m.baseUnit,
    min: m.minimumInventory === 0 ? '' : String(m.minimumInventory),
    max: m.maximumInventory === 0 ? '' : String(m.maximumInventory),
  }
}

export function toMaterialCreateInput(v: MaterialFormValues): MaterialInput {
  const min = parseQuantity(v.min) ?? 0
  const max = parseQuantity(v.max) ?? 0
  return {
    code: v.code.trim().toUpperCase(),
    name: v.name.trim(),
    typeSlug: v.type?.slug ?? '',
    baseUnitSlug: v.baseUnit?.slug ?? '',
    ...(min > 0 ? { minimumInventory: min } : {}),
    ...(max > 0 ? { maximumInventory: max } : {}),
  }
}

/** Chỉ các trường đã đổi so với bản gốc (mã không phân biệt hoa thường; loại/đơn vị so `slug`). */
export function toMaterialUpdateInput(
  v: MaterialFormValues,
  original: Material,
): MaterialUpdateInput {
  const patch: MaterialUpdateInput = {}
  const code = v.code.trim().toUpperCase()
  if (code !== original.code.toUpperCase()) patch.code = code
  const name = v.name.trim()
  if (name !== original.name) patch.name = name
  if (v.type !== null && v.type.slug !== original.type.slug) patch.typeSlug = v.type.slug
  if (v.baseUnit !== null && v.baseUnit.slug !== (original.baseUnit?.slug ?? null)) {
    patch.baseUnitSlug = v.baseUnit.slug
  }
  const min = parseQuantity(v.min) ?? 0
  if (min !== original.minimumInventory) patch.minimumInventory = min
  const max = parseQuantity(v.max) ?? 0
  if (max !== original.maximumInventory) patch.maximumInventory = max
  return patch
}

export function isMaterialDirty(v: MaterialFormValues, original: Material | null): boolean {
  if (original === null) {
    return (
      [v.code, v.name, v.min, v.max].some((s) => s.trim() !== '') ||
      v.type !== null ||
      v.baseUnit !== null
    )
  }
  return Object.keys(toMaterialUpdateInput(v, original)).length > 0
}
