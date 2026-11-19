import { groupFormsByMonth, monthTitle } from './group-by-month'

const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString()
const form = (slug: string, createdAt: string) => ({ slug, createdAt })

describe('monthTitle', () => {
  it('vi "Tháng 11/2026"; en "November 2026"', () => {
    expect(monthTitle(new Date(2026, 10, 5), 'vi')).toBe('Tháng 11/2026')
    expect(monthTitle(new Date(2026, 0, 31), 'en')).toBe('January 2026')
  })
})

describe('groupFormsByMonth', () => {
  it('gom theo THÁNG giờ máy; ranh giới 00:01 ngày 1 / 23:59 ngày cuối thuộc hai tháng', () => {
    const forms = [
      form('a', at(2026, 11, 5, 9)),
      form('b', at(2026, 11, 1, 0, 1)),
      form('c', at(2026, 10, 31, 23, 59)),
      form('d', at(2025, 12, 2, 9)),
    ]
    expect(
      groupFormsByMonth(forms, 'vi').map((g) => [g.key, g.title, g.data.map((f) => f.slug)]),
    ).toEqual([
      ['2026-11', 'Tháng 11/2026', ['a', 'b']],
      ['2026-10', 'Tháng 10/2026', ['c']],
      ['2025-12', 'Tháng 12/2025', ['d']],
    ])
  })

  it('cùng tháng bị cắt giữa hai trang được gộp liền', () => {
    const page1 = [form('a', at(2026, 11, 5)), form('b', at(2026, 10, 30))]
    const page2 = [form('c', at(2026, 10, 2)), form('d', at(2026, 9, 9))]
    const groups = groupFormsByMonth([...page1, ...page2], 'vi')
    expect(groups.map((g) => g.data.map((f) => f.slug))).toEqual([['a'], ['b', 'c'], ['d']])
  })

  it('rỗng → rỗng', () => {
    expect(groupFormsByMonth([], 'vi')).toEqual([])
  })
})
