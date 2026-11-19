import { isApiError } from '@/shared/api/http'
import type { MaterialField } from './material-form'

export type MaterialErrorTarget =
  | { field: MaterialField }
  | { field: 'unit' | 'rate' }
  | { target: 'notFound' }
  | { target: 'inUse' }
  | { target: 'general' }

const MATERIAL_FIELD_CODES: [MaterialField, number[]][] = [
  ['code', [100704, 100705, 100706]],
  ['name', [100702]],
  ['type', [100707, 100601]],
  ['baseUnit', [100714, 100724, 100723, 100901]],
  ['min', [100708]],
  ['max', [100709, 100710]],
]

/** Phân loại lỗi API ghi vật tư để gắn vào ô, báo "không còn" / "đang dùng", hoặc câu chung. */
export function classifyMaterialError(e: unknown): MaterialErrorTarget {
  if (!isApiError(e) || e.code === undefined) return { target: 'general' }
  for (const [field, codes] of MATERIAL_FIELD_CODES) {
    if (codes.includes(e.code)) return { field }
  }
  if (e.code === 100701) return { target: 'notFound' }
  if (e.code === 100712) return { target: 'inUse' }
  return { target: 'general' }
}

/** Phân loại lỗi API ghi đơn vị quy đổi. */
export function classifyConversionError(e: unknown): MaterialErrorTarget {
  if (!isApiError(e) || e.code === undefined) return { target: 'general' }
  if ([100715, 100716, 100901].includes(e.code)) return { field: 'unit' }
  if (e.code === 100718) return { field: 'rate' }
  if (e.code === 100717 || e.code === 100701) return { target: 'notFound' }
  return { target: 'general' }
}
