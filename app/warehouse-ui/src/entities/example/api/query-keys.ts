import type { ListParams } from '@/shared/api/types'
import type { ExampleFilters } from '../model/types'

/**
 * Mọi query key của example sinh ra từ đây. Key lồng nhau theo cấp nên
 * `invalidateQueries({ queryKey: exampleKeys.all })` trúng mọi danh sách.
 * `list` nhận cả bộ lọc: đổi bộ lọc là một mục cache khác. Chỉ khai key đang được dùng.
 */
export const exampleKeys = {
  all: ['examples'] as const,
  lists: () => [...exampleKeys.all, 'list'] as const,
  list: (params: ListParams<ExampleFilters>) => [...exampleKeys.lists(), params] as const,
}
