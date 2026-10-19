import { z } from 'zod'
import { BUSINESS_CODE_REGEX, isCodeLike } from '@/shared/lib/code'

export const addMaterialSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'inventory:materialCodeRequired')
    .regex(BUSINESS_CODE_REGEX, 'inventory:materialCodeInvalid'),
  name: z
    .string()
    .trim()
    .min(1, 'inventory:materialNameRequired')
    .max(255, 'inventory:materialNameTooLong'),
  typeSlug: z.string().min(1, 'inventory:materialTypeRequired'),
  baseUnitSlug: z.string().min(1, 'inventory:baseUnitRequired'),
  supplierSlug: z.string(),
})

export type AddMaterialValues = z.input<typeof addMaterialSchema>

/** Chữ đã gõ trong ô chọn vật tư: trông như mã → ô Mã (viết hoa), ngược lại → ô Tên. */
export function addMaterialDefaults(initialSearch: string): AddMaterialValues {
  const text = initialSearch.trim()
  const asCode = text !== '' && isCodeLike(text)
  return {
    code: asCode ? text.toUpperCase() : '',
    name: asCode ? '' : text,
    typeSlug: '',
    baseUnitSlug: '',
    supplierSlug: '',
  }
}
