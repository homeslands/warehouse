import { format, isValid, parse } from 'date-fns'

const DAY = 'yyyy-MM-dd'
const parseDay = (value: string) => {
  const d = parse(value, DAY, new Date())
  return isValid(d) ? d : undefined
}

/**
 * Bộ lọc khoảng ngày (`YYYY-MM-DD`, theo lịch người dùng) → `from`/`to` ISO cho
 * `GET /suppliers/:slug/transactions` (so theo `transactionDate`, bao gồm cả hai đầu).
 * Ngày cuối lấy 23:59:59.999 giờ máy: giao dịch tối ngày cuối vẫn nằm trong kết quả.
 */
export function toTransactionRange(
  startDate?: string,
  endDate?: string,
): { from?: string; to?: string } {
  const start = startDate ? parseDay(startDate) : undefined
  const end = endDate ? parseDay(endDate) : undefined
  return {
    ...(start
      ? { from: new Date(start.getFullYear(), start.getMonth(), start.getDate()).toISOString() }
      : {}),
    ...(end
      ? {
          to: new Date(
            end.getFullYear(),
            end.getMonth(),
            end.getDate(),
            23,
            59,
            59,
            999,
          ).toISOString(),
        }
      : {}),
  }
}

/**
 * Ngày giao dịch (`YYYY-MM-DD`) → ISO gửi backend. Hôm nay → thời điểm hiện tại (đúng thứ tự trong sổ).
 * Ngày khác → 12:00 giờ máy: lệch múi giờ ±12h không làm nhảy sang ngày bên cạnh.
 */
export function toTransactionDate(date: string, now: Date = new Date()): string {
  if (date === format(now, DAY)) return now.toISOString()
  const d = parseDay(date) ?? now
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0).toISOString()
}
