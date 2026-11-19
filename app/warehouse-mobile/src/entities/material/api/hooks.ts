import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { sortByCode } from '@/shared/lib/catalog'
import { toMaterialSearch } from '../model/search'
import type { MaterialListParams } from '../model/types'
import { fetchAvailableConversionUnits, fetchMaterial, fetchMaterialsPage } from './material.api'
import { materialKeys } from './query-keys'

const STALE_TIME_MS = 30_000

export function useMaterialsInfinite({
  query,
  typeSlug,
  enabled,
}: MaterialListParams & { enabled: boolean }) {
  return useInfiniteQuery({
    queryKey: materialKeys.list({ query, typeSlug }),
    queryFn: ({ pageParam }) => fetchMaterialsPage({ query, typeSlug, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
    enabled: enabled && toMaterialSearch(query).kind !== 'invalid',
    staleTime: STALE_TIME_MS,
  })
}

export function useMaterial(slug: string | undefined) {
  return useQuery({
    queryKey: materialKeys.detail(slug ?? ''),
    queryFn: () => fetchMaterial(slug as string),
    enabled: !!slug,
  })
}

export function useAvailableConversionUnits(
  slug: string | undefined,
  { enabled }: { enabled: boolean },
) {
  return useQuery({
    queryKey: materialKeys.available(slug ?? ''),
    queryFn: () => fetchAvailableConversionUnits(slug as string),
    enabled: enabled && !!slug,
    select: sortByCode,
  })
}
