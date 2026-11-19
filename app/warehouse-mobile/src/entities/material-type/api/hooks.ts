import { useQuery, useQueryClient } from '@tanstack/react-query'
import { sortByCode } from '@/shared/lib/catalog'
import type { MaterialType } from '../model/types'
import { fetchMaterialType, fetchAllMaterialTypes } from './material-type.api'
import { materialTypeKeys } from './query-keys'

export function useMaterialTypes({ enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: materialTypeKeys.list(),
    queryFn: fetchAllMaterialTypes,
    enabled,
    select: sortByCode,
  })
}

/** Có sẵn bản ghi trong cache danh sách thì dùng làm `initialData` (mở chi tiết không chớp). */
export function useMaterialType(slug: string | undefined) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: materialTypeKeys.detail(slug ?? ''),
    queryFn: () => fetchMaterialType(slug as string),
    enabled: !!slug,
    initialData: () =>
      queryClient
        .getQueryData<MaterialType[]>(materialTypeKeys.list())
        ?.find((i) => i.slug === slug),
    initialDataUpdatedAt: () => queryClient.getQueryState(materialTypeKeys.list())?.dataUpdatedAt,
  })
}
