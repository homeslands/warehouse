/*
 * Đọc / hiện chữ của các ô số trên sheet sửa dòng phiếu nhập ở bước 2 (`ComposeLineSheet`, spec
 * wizard-apple §7) — hàm thuần, cùng vai trò với `line-fields.ts` của phiếu xuất.
 */
import { parseDecimalInput, type FormatLocale } from '@/shared/lib/format'
import { formatMoneyInput, parseMoneyInput } from '@/shared/lib/money-input'
import { round2, round6 } from '@/shared/lib/round'

/** Giới hạn cột DECIMAL(18,6) của backend (đơn giá DECIMAL(18,2): `parseMoneyInput` tự chặn). */
const QUANTITY_LIMIT = 1e12

type QtyError = 'invalidQty' | 'scaleQty' | 'quantityTooLarge'
type PriceError = 'unitPriceInvalid' | 'unitPriceTooLarge'

/** Số lượng ≥ 0 (0 = chưa nhập / không nhận), tối đa 6 chữ số lẻ. */
function checkQuantity(text: string): { value: number } | { error: QtyError } {
  const v = parseDecimalInput(text, 6)
  if (v === null) {
    // Đọc được nếu bỏ giới hạn số lẻ → lỗi duy nhất là quá 6 chữ số thập phân.
    return { error: parseDecimalInput(text, 99) !== null ? 'scaleQty' : 'invalidQty' }
  }
  return v >= QUANTITY_LIMIT ? { error: 'quantityTooLarge' } : { value: v }
}

/**
 * Sheet sửa dòng (`/import-line?compose=1`) — ✓ chỉ chặn chữ SAI, THIẾU vẫn lưu (spec wizard-apple §7):
 * trống = 0 "chưa nhập"; chữ không đọc được / quá 6 số lẻ / quá lớn → lỗi.
 */
export function readQuantity(text: string): { value: number } | { error: QtyError } {
  return text.trim() === '' ? { value: 0 } : checkQuantity(text)
}

/** Key (namespace `importForms`) của câu lỗi ô số lượng của sheet dòng. */
export const quantityErrorKey = (e: QtyError) =>
  e === 'quantityTooLarge' ? e : `receive.line.${e}`

/** Số → chữ trong ô (không ngăn nghìn: "1.000" sẽ bị đọc thành 1); 0 = chưa nhập → ô trống. */
export const numText = (n: number | null, decimalSep: string) =>
  n !== null && n > 0 ? String(round6(n)).replace('.', decimalSep) : ''

/** Đơn giá → chữ trong ô, đã ngăn nghìn theo locale (vi "1.200,5", en "1,200.5"); 0 = chưa có giá → trống. */
export function priceText(v: number | null, locale: FormatLocale): string {
  if (v === null || v <= 0) return ''
  const [int, frac] = String(round2(v)).split('.')
  const decimal = locale === 'vi' ? ',' : '.'
  return formatMoneyInput(frac ? `${int}${decimal}${frac}` : int!, locale)
}

/** Chữ (đã ngăn nghìn) → đơn giá; trống = 0 đ (giá nhập tuỳ chọn). Sheet dòng kiểm khi ✓. */
export function parsePrice(
  text: string,
  locale: FormatLocale,
): { value: number } | { error: PriceError } {
  const p = parseMoneyInput(text, locale)
  if ('error' in p)
    return { error: p.error === 'tooLarge' ? 'unitPriceTooLarge' : 'unitPriceInvalid' }
  return { value: p.value ?? 0 }
}
