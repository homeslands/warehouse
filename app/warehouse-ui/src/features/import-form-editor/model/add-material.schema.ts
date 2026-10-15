import { z } from 'zod'
import { BUSINESS_CODE_REGEX, isCodeLike } from '@/shared/lib/code'

export const addMaterialSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'importForms:materialCodeRequired')
    .regex(BUSINESS_CODE_REGEX, 'importForms:materialCodeInvalid'),
  name: z
    .string()
    .trim()
    .min(1, 'importForms:materialNameRequired')
    .max(255, 'importForms:materialNameTooLong'),
  typeSlug: z.string().min(1, 'importForms:materialTypeRequired'),
  baseUnitSlug: z.string().min(1, 'importForms:baseUnitRequired'),
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
