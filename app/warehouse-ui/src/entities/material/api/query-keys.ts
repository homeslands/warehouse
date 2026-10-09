import type { ListParams } from '@/shared/api/types'
import type { MaterialFilters } from '../model/types'

export const materialKeys = {
  all: ['materials'] as const,
  list: (params: ListParams<MaterialFilters>) => [...materialKeys.all, 'list', params] as const,
}
