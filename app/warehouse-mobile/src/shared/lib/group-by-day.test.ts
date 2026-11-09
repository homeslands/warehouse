import { dayTitle, groupFormsByDay } from './group-by-day'

const LABELS = { today: 'Hôm nay', yesterday: 'Hôm qua' }
// Giờ máy: thứ Năm 05/11/2026 10:00.
const NOW = new Date(2026, 10, 5, 10, 0, 0)
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString()
const form = (slug: string, createdAt: string) => ({ slug, createdAt })

describe('dayTitle', () => {
  it('hôm nay / hôm qua', () => {
    expect(dayTitle(new Date(2026, 10, 5), NOW, 'vi', LABELS)).toBe('Hôm nay')
    expect(dayTitle(new Date(2026, 10, 4), NOW, 'vi', LABELS)).toBe('Hôm qua')
  })
  it('cùng năm: thứ + ngày/tháng (vi, en)', () => {
    expect(dayTitle(new Date(2026, 10, 3), NOW, 'vi', LABELS)).toBe('Thứ Ba, 03/11')
    expect(dayTitle(new Date(2026, 10, 3), NOW, 'en', LABELS)).toBe('Tuesday, 03/11')
    expect(dayTitle(new Date(2026, 9, 25), NOW, 'vi', LABELS)).toBe('Chủ Nhật, 25/10')
  })
  it('năm trước: dd/MM/yyyy', () => {
    expect(dayTitle(new Date(2025, 10, 3), NOW, 'vi', LABELS)).toBe('03/11/2025')
  })
  it('hôm qua qua ranh giới tháng/năm', () => {
    const jan1 = new Date(2027, 0, 1, 9)
    expect(dayTitle(new Date(2026, 11, 31), jan1, 'vi', LABELS)).toBe('Hôm qua')
  })
})

describe('groupFormsByDay', () => {
  it('gộp theo ngày giờ máy, giữ thứ tự API', () => {
    const groups = groupFormsByDay(
      [
        form('a', at(2026, 11, 5, 9)),
        form('b', at(2026, 11, 5, 8)),
        form('c', at(2026, 11, 4, 23)),
        form('d', at(2026, 11, 3, 1)),
      ],
      NOW,
      'vi',
      LABELS,
    )
    expect(groups.map((g) => [g.title, g.data.map((f) => f.slug)])).toEqual([
      ['Hôm nay', ['a', 'b']],
      ['Hôm qua', ['c']],
      ['Thứ Ba, 03/11', ['d']],
    ])
  })

  it('ranh giới 23:59 / 00:01 giờ máy thuộc hai ngày khác nhau', () => {
    const groups = groupFormsByDay(
      [form('late', at(2026, 11, 5, 0, 1)), form('early', at(2026, 11, 4, 23, 59))],
      NOW,
      'vi',
      LABELS,
    )
    expect(groups.map((g) => g.title)).toEqual(['Hôm nay', 'Hôm qua'])
  })

  it('cùng ngày bị cắt giữa hai trang được gộp liền; ngày khác không nhập lại', () => {
    const page1 = [form('a', at(2026, 11, 5, 9)), form('b', at(2026, 11, 4, 20))]
    const page2 = [form('c', at(2026, 11, 4, 18)), form('d', at(2026, 11, 3, 9))]
    const groups = groupFormsByDay([...page1, ...page2], NOW, 'vi', LABELS)
    expect(groups.map((g) => g.data.map((f) => f.slug))).toEqual([['a'], ['b', 'c'], ['d']])
    expect(new Set(groups.map((g) => g.key)).size).toBe(3)
  })

  it('rỗng → rỗng', () => {
    expect(groupFormsByDay([], NOW, 'vi', LABELS)).toEqual([])
  })
})
