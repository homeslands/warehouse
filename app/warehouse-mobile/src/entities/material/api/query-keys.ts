import type { MaterialListParams } from '../model/types'

export const materialKeys = {
  all: ['materials'] as const,
  lists: () => ['materials', 'list'] as const,
  list: (p: MaterialListParams) => ['materials', 'list', p] as const,
  detail: (slug: string) => ['materials', 'detail', slug] as const,
  available: (slug: string) => ['materials', 'available-units', slug] as const,
}
