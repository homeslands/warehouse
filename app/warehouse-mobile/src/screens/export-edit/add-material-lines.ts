import type { InventoryItem } from '@/entities/inventory'
import { useExportDraft } from '@/features/export-draft'

import { useLineFocus } from '@/shared/lib/line-focus'
import { newLineFrom } from './line-fields'

/**
 * Thêm mỗi vật tư một dòng mặc định (`newLineFrom`) vào bản nháp đang mở, theo thứ tự truyền vào, rồi
 * yêu cầu bước 2 mở sheet sửa của dòng ĐẦU vừa thêm (`useLineFocus`; ô số focus sẵn). Vật tư chưa
 * khai đơn vị / trùng khoá / bị bỏ qua (đang lưu) không thêm. Trả khoá các dòng đã thêm. Sức chứa (200
 * dòng) do nơi gọi kiểm.
 */
export function addMaterialLines(items: readonly InventoryItem[]): string[] {
  const store = useExportDraft.getState()
  const added: string[] = []
  for (const item of items) {
    const line = newLineFrom(item)
    if (!line) continue
    const result = store.addLine(line)
    if (result.ok) added.push(result.key)
  }
  const formSlug = store.ctx?.formSlug
  if (added[0] && formSlug) useLineFocus.getState().ask('export', formSlug, added[0])
  return added
}
