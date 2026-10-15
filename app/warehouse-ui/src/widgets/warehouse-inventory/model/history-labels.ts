import { formatQuantity } from '@/shared/lib/format'
import type { InventoryAction } from '@/entities/inventory'

export const KNOWN_ACTIONS: readonly InventoryAction[] = [
  'ASSIGN',
  'ADJUST',
  'IMPORT',
  'RESERVE',
  'RELEASE',
  'REMOVE',
]

export const isKnownAction = (action: string): action is InventoryAction =>
  (KNOWN_ACTIONS as readonly string[]).includes(action)

/** BE ghi ghi chú phiếu nhập bằng tiếng Anh ("Import form P500D03"). Không khớp mẫu → `null` (hiện nguyên văn). */
export function importFormCode(note: string | null): string | null {
  const m = note?.match(/^Import form (.+)$/)
  return m ? m[1] : null
}

/** "+5" / "−3" (dấu trừ thật U+2212 cho dễ đọc); 0 → "0". */
export function signed(n: number): string {
  if (n > 0) return `+${formatQuantity(n)}`
  if (n < 0) return `−${formatQuantity(-n)}`
  return '0'
}
