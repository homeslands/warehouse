import type { InventoryItem, InventoryUnit } from '@/entities/inventory'
import { exportLineKey, type ExportLine } from '@/features/export-draft'
import { parseDecimalInput, type FormatLocale } from '@/shared/lib/format'
import { formatMoneyInput, parseMoneyInput } from '@/shared/lib/money-input'
import { round2, round6 } from '@/shared/lib/round'

/** Ghi chú một dòng: chặn ở đây để ô một dòng không phình vô hạn. */
export const NOTE_MAX_LENGTH = 500
/** Giới hạn cột DECIMAL(18,6) của backend (đơn giá DECIMAL(18,2): `parseMoneyInput` tự chặn). */
const QUANTITY_LIMIT = 1e12

/**
 * Sheet sửa dòng `/export-line` — ✓ chỉ chặn chữ SAI, THIẾU vẫn lưu (spec wizard-apple §7). Ô số lượng:
 * trống (hay 0) = 0 "chưa nhập"; chữ không đọc được / quá 6 số lẻ → `quantityUnreadable`; quá lớn.
 */
export function readQuantity(
  text: string,
): { value: number } | { error: 'quantityUnreadable' | 'quantityTooLarge' } {
  if (text.trim() === '') return { value: 0 }
  const v = parseDecimalInput(text, 6)
  if (v === null) return { error: 'quantityUnreadable' }
  if (v >= QUANTITY_LIMIT) return { error: 'quantityTooLarge' }
  return { value: v }
}

/**
 * Sheet sửa dòng: ô đơn giá (chữ đã ngăn nghìn theo locale — `formatMoneyInput`). Trống = `null` "chưa
 * có giá" — LƯU ĐƯỢC (dòng hiện "thiếu giá", phiếu chưa sang bước 3 được); chữ không đọc được / quá 2 số
 * lẻ → `unitPriceInvalid`; quá lớn (DECIMAL(18,2)) → `unitPriceTooLarge`.
 */
export function readPrice(
  text: string,
  locale: FormatLocale,
): { value: number | null } | { error: 'unitPriceInvalid' | 'unitPriceTooLarge' } {
  const p = parseMoneyInput(text, locale)
  if (!('error' in p)) return p
  return { error: p.error === 'tooLarge' ? 'unitPriceTooLarge' : 'unitPriceInvalid' }
}

/** Số lượng → chữ trong ô (không ngăn nghìn); 0 = chưa nhập → trống. */
export const quantityToText = (n: number, decimalSep: string) =>
  n > 0 ? String(round6(n)).replace('.', decimalSep) : ''

/** Đơn giá → chữ trong ô, ngăn nghìn theo locale (vi "1.250.000,5"); `null` → trống. */
export function priceToText(v: number | null, locale: FormatLocale): string {
  if (v === null) return ''
  const [int, frac] = String(round2(v)).split('.')
  const decimal = locale === 'vi' ? ',' : '.'
  return formatMoneyInput(frac ? `${int}${decimal}${frac}` : int!, locale)
}

/** Đơn vị chọn được của vật tư: `units[]` của tồn; thiếu thì chỉ còn đơn vị gốc (tỉ lệ 1). */
export function unitsOf(item: InventoryItem): InventoryUnit[] {
  if (item.units.length > 0) return item.units
  const b = item.baseUnit
  return b
    ? [
        {
          unitSlug: b.slug,
          unitCode: b.code,
          unitName: b.name,
          conversionRate: 1,
          isBaseUnit: true,
        },
      ]
    : []
}

export const baseUnitOf = (item: InventoryItem): InventoryUnit | undefined => {
  const units = unitsOf(item)
  return (
    units.find((u) => u.isBaseUnit) ??
    units.find((u) => u.unitSlug === item.baseUnit?.slug) ??
    units[0]
  )
}

/**
 * Dòng mới cho một vật tư của kho (bộ chọn nhiều vật tư, quét mã): đơn vị gốc, lô tự động, số lượng 0
 * (= chưa nhập — `canSave` coi là `badQuantity` nên phải nhập trước khi Gửi duyệt), chưa có đơn giá
 * (cảnh báo "Chưa có đơn giá"). Vật tư chưa khai đơn vị nào → `null` (không thêm được).
 */
export function newLineFrom(item: InventoryItem): ExportLine | null {
  const unit = baseUnitOf(item)
  if (!unit) return null
  const line: ExportLine = {
    key: '',
    materialSlug: item.materialSlug,
    materialCode: item.materialCode,
    materialName: item.materialName,
    unitSlug: unit.unitSlug,
    unitName: unit.unitName,
    conversionRate: unit.conversionRate,
    quantity: 0,
    unitPrice: null,
    batchSlug: null,
    batchExpiryDate: null,
    note: null,
    base: null,
  }
  return { ...line, key: exportLineKey(line) }
}
