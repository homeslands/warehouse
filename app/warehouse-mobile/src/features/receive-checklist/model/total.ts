import { sumLineAmounts } from '@/shared/lib/line-amount'

import type { LocalLine } from './draft'

/**
 * Tổng tiền của các dòng đang hiện = Σ số lượng × đơn giá, theo cùng cách tính của server
 * (`amount` làm tròn 2 số lẻ từng dòng, `total` cộng dồn rồi làm tròn 2 số lẻ) — `sumLineAmounts`.
 */
export function linesTotal(lines: readonly LocalLine[]): number {
  return sumLineAmounts(lines)
}
