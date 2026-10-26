import type { MaterialBatch } from '@/entities/material-batch'
import type { ExportFormItemValues } from './export-form-editor.schema'

type Line = Pick<ExportFormItemValues, 'materialSlug' | 'batchSlug'>

/**
 * Lô đã biết theo slug cho luật vượt khả dụng. Danh sách lô mới tải (`lists`: vật tư → lô còn hàng, `status = 1`) thắng
 * bản chụp lúc chọn tay (`picked`). Lô đã chọn mà KHÔNG còn trong danh sách mới của vật tư → lô đã hết / bị giữ chỗ hết:
 * coi khả dụng = 0 để dòng đó bị đánh dấu. Chỉ kết luận vậy khi danh sách đủ (ngắn hơn `pageSize`) — đủ trang thì lô có
 * thể nằm ở trang sau.
 */
export function knownBatches(
  lines: readonly Line[],
  picked: ReadonlyMap<string, MaterialBatch>,
  lists: ReadonlyMap<string, readonly MaterialBatch[]>,
  pageSize: number,
): Map<string, MaterialBatch> {
  const known = new Map(picked)
  for (const list of lists.values()) for (const b of list) known.set(b.slug, b)
  for (const { materialSlug, batchSlug } of lines) {
    if (batchSlug === '') continue
    const list = lists.get(materialSlug)
    if (!list || list.length >= pageSize || list.some((b) => b.slug === batchSlug)) continue
    const base = known.get(batchSlug)
    known.set(batchSlug, {
      ...(base ?? ({ slug: batchSlug, materialSlug, expiryDate: null } as MaterialBatch)),
      availableQuantity: 0,
    })
  }
  return known
}
