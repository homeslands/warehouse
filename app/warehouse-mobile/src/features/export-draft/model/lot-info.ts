import { useQueries } from '@tanstack/react-query'
import { useCallback } from 'react'

import { fetchMaterialBatches, inventoryKeys, type MaterialBatch } from '@/entities/inventory'

const STALE_TIME_MS = 60_000

/** Dòng phiếu xuất (dòng server hay dòng bản nháp) — chỉ cần vật tư + lô. */
type LotRef = { materialSlug: string; batchSlug: string | null }

/**
 * Thông tin lô (ngày nhập, khả dụng) của các dòng đã có lô: tải lô THEO TỪNG vật tư (`inStockOnly:
 * false` — sau khi xác nhận / khi gửi duyệt lô có thể đã hết hàng) rồi tra theo `batchSlug`. Lỗi /
 * chưa tải xong → lô đó không có trong map (nơi gọi vẫn hiện HSD từ dòng phiếu). Key riêng (có `all`)
 * để không lẫn với danh sách lô còn hàng của tab Tồn kho; vẫn nằm dưới `inventoryKeys.batches` nên
 * bị invalidate cùng. Dùng chung cho màn xem và màn sửa phiếu xuất.
 */
export function useLotInfo(
  warehouseSlug: string | undefined,
  lines: readonly LotRef[] | undefined,
): Map<string, MaterialBatch> {
  const materials = [
    ...new Set((lines ?? []).filter((l) => l.batchSlug !== null).map((l) => l.materialSlug)),
  ].sort()
  const combine = useCallback((results: { data?: MaterialBatch[] }[]) => {
    const map = new Map<string, MaterialBatch>()
    for (const r of results) for (const b of r.data ?? []) map.set(b.slug, b)
    return map
  }, [])
  return useQueries({
    queries: materials.map((materialSlug) => ({
      queryKey: [...inventoryKeys.batches(warehouseSlug ?? '', materialSlug), 'all'] as const,
      queryFn: () =>
        fetchMaterialBatches(warehouseSlug as string, materialSlug, { inStockOnly: false }),
      enabled: !!warehouseSlug,
      staleTime: STALE_TIME_MS,
    })),
    combine,
  })
}
