import { useQueryClient, type Query } from '@tanstack/react-query'
import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'

/** Khoá query dạng `[root, kho, kind, extra]` của các entity. */
export type QueryKeyParts = { root: string; kind: string; extra: unknown }

/**
 * Tab / màn luôn được giữ mounted nên quay lại tab (focus) HOẶC mở lại app (foreground) thì làm mới các
 * query đang dùng của kho `slug` mà `include` chọn và đã cũ (quá staleTime); query đang tải / còn tươi
 * không bị gọi lại. Cũng render lại màn để "hôm nay" kịp sang ngày mới nếu app để mở qua nửa đêm.
 * `include` phải ổn định (hằng module). Không có kho → không request.
 */
export function useRefetchStale(
  slug: string | undefined,
  include: (parts: QueryKeyParts) => boolean,
): void {
  const queryClient = useQueryClient()
  const [, setTick] = useState(0)
  const refetchStale = useCallback(() => {
    setTick((n) => n + 1)
    if (!slug) return
    void queryClient.refetchQueries(
      {
        type: 'active',
        stale: true,
        predicate: (query: Query) => {
          const [root, wh, kind, extra] = query.queryKey as [string, string, string, unknown]
          return wh === slug && include({ root, kind, extra })
        },
      },
      { cancelRefetch: false },
    )
  }, [queryClient, slug, include])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetchStale()
    })
    return () => sub.remove()
  }, [refetchStale])
  useFocusEffect(refetchStale)
}
