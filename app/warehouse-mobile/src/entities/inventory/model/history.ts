import { calendarDaysBetween, parseLocalDate } from './expiry'
import type { InventoryHistory } from './types'

export type HistoryGroup = {
  key: string
  label: 'today' | 'yesterday' | string
  rows: InventoryHistory[]
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Nhóm theo ngày (giờ máy), giữ thứ tự đầu vào (API trả mới → cũ). */
export function groupHistoryByDay(rows: InventoryHistory[], today: Date): HistoryGroup[] {
  const groups: HistoryGroup[] = []
  const byKey = new Map<string, HistoryGroup>()
  for (const row of rows) {
    const d = parseLocalDate(row.createdAt)
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    let g = byKey.get(key)
    if (!g) {
      const ago = calendarDaysBetween(d, today)
      const label =
        ago === 0
          ? 'today'
          : ago === 1
            ? 'yesterday'
            : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
      g = { key, label, rows: [] }
      byKey.set(key, g)
      groups.push(g)
    }
    g.rows.push(row)
  }
  return groups
}
