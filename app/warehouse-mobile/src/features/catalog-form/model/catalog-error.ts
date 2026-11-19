import { isApiError } from '@/shared/api/http'
import type { CatalogKind } from './catalog-form'

export type CatalogErrorTarget =
  { field: 'code' | 'name' } | { target: 'notFound' } | { target: 'inUse' } | { target: 'general' }

type Codes = { code: number[]; name: number[]; notFound: number; inUse: number }

const CODES: Record<CatalogKind, Codes> = {
  unit: {
    code: [100904, 100905, 100906, 100907],
    name: [100902, 100903],
    notFound: 100901,
    inUse: 100909,
  },
  'material-type': {
    code: [100604, 100605, 100606, 100607],
    name: [100602, 100603],
    notFound: 100601,
    inUse: 100609,
  },
}

/** Phân loại lỗi API để sheet gắn vào ô, báo "không còn" / "đang dùng", hoặc câu chung. */
export function classifyCatalogError(kind: CatalogKind, e: unknown): CatalogErrorTarget {
  if (!isApiError(e) || e.code === undefined) return { target: 'general' }
  const c = CODES[kind]
  if (c.code.includes(e.code)) return { field: 'code' }
  if (c.name.includes(e.code)) return { field: 'name' }
  if (e.code === c.notFound) return { target: 'notFound' }
  if (e.code === c.inUse) return { target: 'inUse' }
  return { target: 'general' }
}
