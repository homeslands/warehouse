import type { ListParams } from '@/shared/api/types'
import type { MaterialTypeFilters } from '../model/types'

/** Key lồng theo cấp: `invalidateQueries({ queryKey: materialTypeKeys.all })` trúng mọi truy vấn loại vật tư. */
export const materialTypeKeys = {
  all: ['material-types'] as const,
  lists: () => [...materialTypeKeys.all, 'list'] as const,
  list: (params: ListParams<MaterialTypeFilters>) => [...materialTypeKeys.lists(), params] as const,
}
