import type { PickItem } from './MaterialPickList'

export type SelectAllPlan = { mode: 'add' | 'remove'; ids: string[] }

/**
 * "Chọn tất cả" của danh sách chọn nhiều vật tư — chỉ tính các dòng ĐANG HIỆN. `add`: các dòng `pickable`
 * chưa tick, theo thứ tự danh sách, cắt ở `capacityLeft`. `remove` (hết dòng để thêm, hoặc đã đủ sức
 * chứa): các dòng đang hiện đã tick — tick của lần tìm trước giữ nguyên. `null` = không có gì để làm
 * (không có dòng `pickable`, hoặc đã đủ sức chứa mà chưa tick dòng nào đang hiện).
 */
export function planSelectAll(
  items: readonly PickItem[],
  checked: ReadonlySet<string>,
  capacityLeft: number,
): SelectAllPlan | null {
  const pickable = items.filter((m) => m.state === 'pickable')
  const open = pickable.filter((m) => !checked.has(m.id))
  if (open.length > 0 && capacityLeft > 0) {
    return { mode: 'add', ids: open.slice(0, capacityLeft).map((m) => m.id) }
  }
  const ticked = pickable.filter((m) => checked.has(m.id))
  return ticked.length > 0 ? { mode: 'remove', ids: ticked.map((m) => m.id) } : null
}
