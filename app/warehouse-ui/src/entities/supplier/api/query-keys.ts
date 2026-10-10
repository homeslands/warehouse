import type { ListParams } from '@/shared/api/types'
import type { SupplierFilters } from '../model/types'

/** Key lồng theo cấp: `invalidateQueries({ queryKey: supplierKeys.all })` trúng mọi truy vấn của nhà cung cấp. */
export const supplierKeys = {
  all: ['suppliers'] as const,
  lists: () => [...supplierKeys.all, 'list'] as const,
  list: (params: ListParams<SupplierFilters>) => [...supplierKeys.lists(), params] as const,
  detail: (slug: string) => [...supplierKeys.all, 'detail', slug] as const,
  materials: (slug: string) => [...supplierKeys.all, 'materials', slug] as const,
  transactions: (slug: string) => [...supplierKeys.all, 'transactions', slug] as const,
}
