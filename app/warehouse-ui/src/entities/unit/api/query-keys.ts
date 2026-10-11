import type { ListParams } from '@/shared/api/types'
import type { UnitFilters } from '../model/types'

/** Key lồng theo cấp: `invalidateQueries({ queryKey: unitKeys.all })` trúng mọi truy vấn đơn vị. */
export const unitKeys = {
  all: ['units'] as const,
  lists: () => [...unitKeys.all, 'list'] as const,
  list: (params: ListParams<UnitFilters>) => [...unitKeys.lists(), params] as const,
}
