import { useQueries, useQuery } from '@tanstack/react-query'
import type { ListParams } from '@/shared/api/types'
import { fetchMaterialBatches } from './material-batch.api'
import { materialBatchKeys } from './query-keys'
import { compareBatchesFefo } from '../model/sort'
import type { MaterialBatch, MaterialBatchFilters } from '../model/types'

/** Tối đa lô lấy cho một vật tư khi chọn lô — danh sách ngắn hơn số này là đủ mọi lô còn hàng của vật tư. */
export const MATERIAL_BATCH_PICKER_SIZE = 100

const PICKER_PARAMS = (materialSlug: string): ListParams<MaterialBatchFilters> => ({
  page: 1,
  size: MATERIAL_BATCH_PICKER_SIZE,
  status: 1,
  sortBy: 'expiryDate',
  sort: 'ASC',
  materialSlug,
})

/** Ở cấp module để `data` không đổi tham chiếu mỗi lần vẽ (select inline là hàm mới → mảng mới). */
// MySQL xếp hạn null lên đầu khi ASC, còn BE lấy FEFO null cuối → sắp lại cho khớp.
const sortFefo = (items: MaterialBatch[]): MaterialBatch[] => [...items].sort(compareBatchesFefo)

/**
 * Lô còn hàng của một vật tư, hạn dùng gần nhất trước (FEFO). Gọi khi `enabled` và đã có kho +
 * vật tư; người gọi tự gác quyền MATERIAL_READ + WAREHOUSE_READ.
 */
const pickerQuery = (warehouseSlug: string, materialSlug: string) => ({
  queryKey: materialBatchKeys.material(warehouseSlug, materialSlug),
  queryFn: async () =>
    (await fetchMaterialBatches(warehouseSlug, PICKER_PARAMS(materialSlug))).items,
})

export function useMaterialBatches(
  warehouseSlug: string,
  materialSlug: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery<MaterialBatch[]>({
    ...pickerQuery(warehouseSlug, materialSlug),
    select: sortFefo,
    enabled: enabled && warehouseSlug !== '' && materialSlug !== '',
  })
}

/**
 * Lô còn hàng của NHIỀU vật tư: `materialSlug` → danh sách lô (FEFO như BE trả), chỉ có vật tư đã tải xong. Cùng key /
 * bộ lọc với `useMaterialBatches` nên dùng chung cache với ô chọn lô. Form giữ các query này "đang chạy" để invalidate
 * lô là tải lại được số khả dụng mới. Danh sách là lô `status = 1`: lô đã hết không còn trong đó. Người gọi tự gác quyền
 * MATERIAL_READ + WAREHOUSE_READ.
 */
export function useBatchesOfMaterials(
  warehouseSlug: string,
  materialSlugs: readonly string[],
  { enabled = true }: { enabled?: boolean } = {},
): ReadonlyMap<string, MaterialBatch[]> {
  const slugs = [...new Set(materialSlugs)].filter((m) => m !== '')
  return useQueries({
    queries: slugs.map((m) => ({
      ...pickerQuery(warehouseSlug, m),
      enabled: enabled && warehouseSlug !== '',
    })),
    combine: (results) =>
      new Map(
        results.flatMap((r, i): [string, MaterialBatch[]][] =>
          r.data ? [[slugs[i], r.data]] : [],
        ),
      ),
  })
}
