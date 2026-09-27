import type { ListParams } from '@/shared/api/types'
import type { UserFilters } from '../model/types'

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (params: ListParams<UserFilters>) => [...userKeys.lists(), params] as const,
}

/** Vai trò đổi cực hiếm và mọi màn cần tra `roleSlug` đều dùng lại — key riêng, staleTime dài. */
export const roleKeys = {
  all: ['roles'] as const,
}
