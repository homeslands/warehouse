import { groupHistoryByDay } from './history'
import type { InventoryHistory } from './types'

const row = (slug: string, createdAt: string): InventoryHistory => ({
  slug,
  createdAt,
  updatedAt: createdAt,
  action: 'IMPORT',
  quantityDelta: 1,
  quantityBefore: 0,
  quantityAfter: 1,
  reservedDelta: 0,
  reservedBefore: 0,
  reservedAfter: 0,
  note: null,
  changedBySlug: null,
  changedByName: '',
})

describe('groupHistoryByDay', () => {
  it('nhóm hôm nay / hôm qua / ngày cũ, mới → cũ', () => {
    const today = new Date(2026, 10, 4, 12)
    const rows = [
      row('a', new Date(2026, 10, 4, 9).toISOString()),
      row('b', new Date(2026, 10, 4, 8).toISOString()),
      row('c', new Date(2026, 10, 3, 20).toISOString()),
      row('d', new Date(2026, 10, 1, 7).toISOString()),
    ]
    const g = groupHistoryByDay(rows, today)
    expect(g.map((x) => x.label)).toEqual(['today', 'yesterday', '01/11/2026'])
    expect(g.map((x) => x.rows.length)).toEqual([2, 1, 1])
  })
  it('rỗng → rỗng', () => {
    expect(groupHistoryByDay([], new Date())).toEqual([])
  })
})
