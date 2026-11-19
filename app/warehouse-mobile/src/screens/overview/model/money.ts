// Đã chuyển xuống entity (sheet Hạn dùng cũng dùng); giữ re-export cho import cũ.
export { expiryCutoffs } from '@/entities/inventory'

/** Nhãn đếm ngược hạn dùng: quá hạn `n` ngày / hôm nay / còn `n` ngày. */
export function countdownLabel(days: number): { key: 'overdue' | 'today' | 'left'; n: number } {
  if (days < 0) return { key: 'overdue', n: -days }
  if (days === 0) return { key: 'today', n: 0 }
  return { key: 'left', n: days }
}
