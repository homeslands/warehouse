import { describe, expect, it } from 'vitest'
import { fillBlankLines } from './fill-blank-lines'

type L = { m: string; q?: number }
const blank = (l: L) => l.m === '' && l.q === undefined

describe('fillBlankLines', () => {
  it('lấp các dòng trống (kể cả ở giữa) theo thứ tự trước, phần còn lại nối cuối', () => {
    const lines: L[] = [{ m: 'a', q: 1 }, { m: '' }, { m: 'b' }, { m: '' }]
    const { lines: next, firstNewIndex } = fillBlankLines(
      lines,
      [{ m: 'x' }, { m: 'y' }, { m: 'z' }],
      blank,
      10,
    )
    expect(next.map((l) => l.m)).toEqual(['a', 'x', 'b', 'y', 'z'])
    expect(firstNewIndex).toBe(1)
    expect(next[0]).toBe(lines[0])
    expect(next[2]).toBe(lines[2])
  })

  it('dòng gõ dở (không "trống hẳn") được giữ, dòng mới nối sau', () => {
    const lines: L[] = [{ m: '', q: 5 }, { m: '' }]
    const { lines: next, firstNewIndex } = fillBlankLines(
      lines,
      [{ m: 'x' }, { m: 'y' }],
      blank,
      10,
    )
    expect(next[0]).toBe(lines[0])
    expect(next.map((l) => l.m)).toEqual(['', 'x', 'y'])
    expect(firstNewIndex).toBe(1)
  })

  it('không vượt max: lấp hết dòng trống, nối tới max, bỏ phần thừa', () => {
    const lines: L[] = [{ m: 'a' }, { m: '' }]
    const { lines: next, firstNewIndex } = fillBlankLines(
      lines,
      [{ m: 'x' }, { m: 'y' }, { m: 'z' }],
      blank,
      3,
    )
    expect(next.map((l) => l.m)).toEqual(['a', 'x', 'y'])
    expect(firstNewIndex).toBe(1)
  })

  it('đã đủ max và không có dòng trống → không thêm gì, firstNewIndex null', () => {
    const lines: L[] = [{ m: 'a' }, { m: 'b' }]
    expect(fillBlankLines(lines, [{ m: 'x' }], blank, 2)).toEqual({
      lines,
      firstNewIndex: null,
    })
  })

  it('không có gì để thêm → giữ nguyên, firstNewIndex null', () => {
    const lines: L[] = [{ m: '' }]
    expect(fillBlankLines(lines, [], blank, 5)).toEqual({ lines, firstNewIndex: null })
  })

  it('không đổi mảng đầu vào', () => {
    const lines: L[] = [{ m: '' }]
    fillBlankLines(lines, [{ m: 'x' }], blank, 5)
    expect(lines).toEqual([{ m: '' }])
  })
})
