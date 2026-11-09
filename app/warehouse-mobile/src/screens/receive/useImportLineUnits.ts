import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { fetchAvailableMaterials, importFormKeys, type AvailableUnit } from '@/entities/import-form'
import { can, useAuthStore } from '@/entities/session'
import type { LocalLine } from '@/features/receive-checklist'

/** Đơn vị của vật tư ít đổi: dùng lại bản đã tải trong phiên thay vì gọi lại mỗi lần chạm chip. */
const STALE_MS = 5 * 60_000

/**
 * Đơn vị của vật tư trên một dòng nhập, tải LƯỜI. Dòng thêm từ bộ chọn / quét đã mang `line.units` →
 * dùng ngay. Dòng từ server không có → `load()` (khi người dùng chạm chip / mở bảng dòng) tìm vật tư
 * theo mã trong `available-materials` của kho, lấy đúng `slug`. Lỗi mạng hoặc không thấy vật tư →
 * `null` (màn tự báo, hook không nuốt thành danh sách rỗng). Backend gác `available-materials` bằng
 * `IMPORT_FORM_CREATE`: thiếu quyền này mà dòng không có snapshot → `canLoad` false, `load()` trả `null`
 * KHÔNG gọi API (màn hiện đơn vị là chữ, không đổi được).
 */
export function useImportLineUnits(line: LocalLine, warehouseSlug: string | undefined) {
  const queryClient = useQueryClient()
  const [fetched, setFetched] = useState<{ key: string; units: AvailableUnit[] } | null>(null)
  const allowed = useAuthStore((s) => !!s.user && can(s.user, 'IMPORT_FORM_CREATE'))
  const own = line.units ?? null
  const canLoad = own !== null || allowed
  const units = own ?? (fetched && fetched.key === line.materialSlug ? fetched.units : null)

  const { materialCode, materialSlug } = line
  const load = useCallback(async (): Promise<AvailableUnit[] | null> => {
    if (own) return own
    if (!warehouseSlug || !allowed) return null
    try {
      const result = await queryClient.fetchQuery({
        queryKey: importFormKeys.available(warehouseSlug, materialCode),
        queryFn: () => fetchAvailableMaterials(warehouseSlug, { query: materialCode, page: 1 }),
        staleTime: STALE_MS,
      })
      const found = result.items.find((m) => m.slug === materialSlug)?.units
      if (!found || found.length === 0) return null
      setFetched({ key: materialSlug, units: found })
      return found
    } catch {
      return null
    }
  }, [own, warehouseSlug, allowed, queryClient, materialCode, materialSlug])

  return { units, load, canLoad }
}
