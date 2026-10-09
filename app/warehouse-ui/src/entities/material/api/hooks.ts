import { useQuery } from '@tanstack/react-query'
import { fetchMaterials } from './material.api'
import { materialKeys } from './query-keys'

/** Danh sách vật tư cho ô chọn: trang 1, `size: 100`; `enabled` để chỉ tải khi mở hộp thoại. */
export function useMaterialOptions(options: { enabled?: boolean } = {}) {
  const params = { page: 1, size: 100 }
  return useQuery({
    queryKey: materialKeys.list(params),
    queryFn: () => fetchMaterials(params),
    enabled: options.enabled ?? true,
  })
}
