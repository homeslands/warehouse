import { z } from 'zod'
import { BUSINESS_CODE_REGEX, isCodeLike } from '@/shared/lib/code'
import { thresholdSchema } from './thresholds'

export const addMaterialSchema = z
  .object({
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
    /** Ngưỡng MẶC ĐỊNH của vật tư mới (gửi trong `material`); trống = không gửi = backend lưu 0. */
    minimumInventory: thresholdSchema,
    maximumInventory: thresholdSchema,
  })
  // Như form vật tư: tối đa trống = 0 ở backend, nên nhập tối thiểu > 0 thì phải nhập tối đa ≥ nó (100710).
  .refine((v) => (v.maximumInventory ?? 0) >= (v.minimumInventory ?? 0), {
    path: ['maximumInventory'],
    message: 'inventory:thresholdRange',
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
    minimumInventory: undefined,
    maximumInventory: undefined,
  }
}
