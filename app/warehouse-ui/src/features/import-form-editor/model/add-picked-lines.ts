import { fillBlankLines } from '@/shared/lib/fill-blank-lines'
import {
  EMPTY_ITEM,
  IMPORT_FORM_ITEMS_MAX,
  type ImportFormItemValues,
} from './import-form-editor.schema'

/**
 * Dòng trống HẲN: chưa vật tư, chưa SL, chưa đơn giá, không ghi chú, không bên bán riêng, chưa chọn hạn dùng. Chỉ dòng này mới được lấp bằng
 * vật tư chọn từ hộp — dòng chưa có vật tư nhưng đã gõ dữ liệu là của người dùng, giữ nguyên.
 */
export const isBlankLine = (item: ImportFormItemValues): boolean =>
  item.materialSlug === '' &&
  item.quantity === undefined &&
  item.unitPrice === undefined &&
  item.note === '' &&
  item.supplierOverride === '' &&
  item.expiryDate === ''

/**
 * Thêm vật tư chọn từ hộp "Chọn vật tư" thành dòng: lấp các dòng trống hẳn theo thứ tự trước, phần còn lại nối cuối,
 * không vượt `max` (bỏ phần thừa). Dòng được lấp / thêm = dòng trống + vật tư + đơn vị gốc. Dòng không đổi giữ nguyên
 * tham chiếu. `firstIndex` = dòng được lấp / thêm đầu tiên (null nếu không thêm gì).
 */
export function addPickedLines(
  items: ImportFormItemValues[],
  picked: { slug: string; baseUnitSlug: string }[],
  max = IMPORT_FORM_ITEMS_MAX,
): { items: ImportFormItemValues[]; firstIndex: number | null } {
  const { lines, firstNewIndex } = fillBlankLines(
    items,
    picked.map((p) => ({ ...EMPTY_ITEM, materialSlug: p.slug, unitSlug: p.baseUnitSlug })),
    isBlankLine,
    max,
  )
  return { items: lines, firstIndex: firstNewIndex }
}
