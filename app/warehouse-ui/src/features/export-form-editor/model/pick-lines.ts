import { fillBlankLines } from '@/shared/lib/fill-blank-lines'
import type { InventoryItem } from '@/entities/inventory'
import {
  EMPTY_EXPORT_ITEM,
  EXPORT_FORM_ITEMS_MAX,
  type ExportFormItemValues,
} from './export-form-editor.schema'
import { baseUnitSlugOf } from './material-search'

/** Dòng trống HẲN: không vật tư, SL, đơn giá, ghi chú, lô. Chỉ dòng này mới được lấp bằng vật tư chọn từ hộp. */
export const isBlankExportLine = (item: ExportFormItemValues): boolean =>
  item.materialSlug === '' &&
  item.quantity === undefined &&
  item.unitPrice === undefined &&
  item.note === '' &&
  item.batchSlug === ''

/** Vật tư → dòng mới (đơn vị gốc, lô tự chọn). */
export const pickedToExportLine = (stock: InventoryItem): ExportFormItemValues => ({
  ...EMPTY_EXPORT_ITEM,
  materialSlug: stock.materialSlug,
  unitSlug: baseUnitSlugOf(stock),
})

/** Thêm vật tư chọn từ hộp "Chọn nhiều vật tư": lấp dòng trống hẳn trước, nối cuối, tối đa `max`. */
export function addPickedExportLines(
  items: ExportFormItemValues[],
  picked: InventoryItem[],
  max = EXPORT_FORM_ITEMS_MAX,
): { items: ExportFormItemValues[]; firstIndex: number | null } {
  const { lines, firstNewIndex } = fillBlankLines(
    items,
    picked.map(pickedToExportLine),
    isBlankExportLine,
    max,
  )
  return { items: lines, firstIndex: firstNewIndex }
}
