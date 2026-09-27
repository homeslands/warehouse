import { useQuery } from '@tanstack/react-query'
import { fetchAuthorities } from './authority.api'
import { authorityKeys } from './query-keys'

/** Danh sách authority chỉ đổi khi backend chạy migration → giữ lâu trong cache. */
const AUTHORITIES_STALE_TIME = 30 * 60 * 1000

export function useAuthorities() {
  return useQuery({
    queryKey: authorityKeys.all,
    queryFn: fetchAuthorities,
    staleTime: AUTHORITIES_STALE_TIME,
  })
}
