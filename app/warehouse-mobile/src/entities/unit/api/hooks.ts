import { useQuery, useQueryClient } from '@tanstack/react-query'
import { sortByCode } from '@/shared/lib/catalog'
import type { Unit } from '../model/types'
import { fetchUnit, fetchAllUnits } from './unit.api'
import { unitKeys } from './query-keys'

export function useUnits({ enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: unitKeys.list(),
    queryFn: fetchAllUnits,
    enabled,
    select: sortByCode,
  })
}

/** Có sẵn bản ghi trong cache danh sách thì dùng làm `initialData` (mở chi tiết không chớp). */
export function useUnit(slug: string | undefined) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: unitKeys.detail(slug ?? ''),
    queryFn: () => fetchUnit(slug as string),
    enabled: !!slug,
    initialData: () =>
      queryClient.getQueryData<Unit[]>(unitKeys.list())?.find((i) => i.slug === slug),
    initialDataUpdatedAt: () => queryClient.getQueryState(unitKeys.list())?.dataUpdatedAt,
    // Backend chỉ trả `materialCount` ở danh sách, không có ở chi tiết → mượn số của dòng list cùng slug.
    // Không có ở đâu thì để `undefined` (= chưa biết).
    select: (unit) => {
      if (unit.materialCount) return unit
      const count = queryClient
        .getQueryData<Unit[]>(unitKeys.list())
        ?.find((i) => i.slug === unit.slug)?.materialCount
      return count ? { ...unit, materialCount: count } : unit
    },
  })
}
