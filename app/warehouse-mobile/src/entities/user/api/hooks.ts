import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { fetchUserOptions } from './user.api'
import { userKeys } from './query-keys'

/**
 * Tìm người (trang đầu 20). `enabled` = có `USER_READ` — thiếu quyền thì không bao giờ gọi `/users`.
 * Giữ kết quả cũ trong lúc gõ (danh sách người không phụ thuộc kho nên không lẫn dữ liệu).
 */
export function useUserSearch(term: string, enabled: boolean) {
  const q = term.trim()
  return useQuery({
    queryKey: userKeys.search(q),
    queryFn: () => fetchUserOptions(q),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}
