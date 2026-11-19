import { BUSINESS_CODE_REGEX, UNIT_CODE_REGEX } from '@/shared/lib/code'
import type { CatalogItem } from '@/shared/lib/catalog'

export type CatalogKind = 'unit' | 'material-type'

export type CatalogFormValues = { code: string; name: string; description: string }

export const EMPTY_CATALOG_FORM: CatalogFormValues = { code: '', name: '', description: '' }

export type CatalogFieldError = 'required' | 'codeInvalid' | 'tooLong'

export type CatalogFormErrors = Partial<Record<keyof CatalogFormValues, CatalogFieldError>>

const MAX_LENGTH = 255

export function validateCatalogForm(kind: CatalogKind, v: CatalogFormValues): CatalogFormErrors {
  const errors: CatalogFormErrors = {}
  const code = v.code.trim()
  const regex = kind === 'unit' ? UNIT_CODE_REGEX : BUSINESS_CODE_REGEX
  if (code === '') errors.code = 'required'
  else if (!regex.test(code)) errors.code = 'codeInvalid'

  const name = v.name.trim()
  if (name === '') errors.name = 'required'
  else if (name.length > MAX_LENGTH) errors.name = 'tooLong'

  if (v.description.trim().length > MAX_LENGTH) errors.description = 'tooLong'
  return errors
}

export function toFormValues(item: CatalogItem): CatalogFormValues {
  return { code: item.code, name: item.name, description: item.description ?? '' }
}

export function toCreateInput(v: CatalogFormValues): {
  code: string
  name: string
  description?: string
} {
  const description = v.description.trim()
  return {
    code: v.code.trim().toUpperCase(),
    name: v.name.trim(),
    ...(description === '' ? {} : { description }),
  }
}

/** Chỉ các trường đã đổi so với bản gốc (mã so không phân biệt hoa thường; mô tả xoá → `''`). */
export function toUpdateInput(
  v: CatalogFormValues,
  original: CatalogItem,
): { code?: string; name?: string; description?: string } {
  const patch: { code?: string; name?: string; description?: string } = {}
  const code = v.code.trim().toUpperCase()
  if (code !== original.code.toUpperCase()) patch.code = code
  const name = v.name.trim()
  if (name !== original.name) patch.name = name
  const description = v.description.trim()
  if (description !== (original.description ?? '')) patch.description = description
  return patch
}

export function isCatalogDirty(v: CatalogFormValues, original: CatalogItem | null): boolean {
  if (original === null) {
    return [v.code, v.name, v.description].some((s) => s.trim() !== '')
  }
  return Object.keys(toUpdateInput(v, original)).length > 0
}
