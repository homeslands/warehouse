import { round2 } from './round'

/**
 * Thành tiền một dòng phiếu = số lượng × đơn giá (trống = 0), làm tròn 2 số lẻ — như `amount` của server.
 * Dùng chung phiếu nhập / phiếu xuất (thẻ, bước 3, tổng).
 */
export function lineAmount(quantity: number, unitPrice: number | null): number {
  return round2(quantity * (unitPrice ?? 0))
}

/**
 * Tổng tiền = Σ `lineAmount` của từng dòng, cộng dồn rồi làm tròn 2 số lẻ — như `total` của server. Không
 * giống từng bit: `round2` (`Math.round(x × 100) / 100`) khác `Number(x.toFixed(2))` của server ở vài
 * trường hợp dấu phẩy động hiếm, lệch tối đa 0,01 — màn hình chỉ hiện tới đồng nên gần như không thấy.
 */
export function sumLineAmounts(
  lines: readonly { quantity: number; unitPrice: number | null }[],
): number {
  let total = 0
  for (const l of lines) total = round2(total + lineAmount(l.quantity, l.unitPrice))
  return total
}
