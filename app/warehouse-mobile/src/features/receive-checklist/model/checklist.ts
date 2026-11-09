import { lineValues, sameBase, type LocalLine } from './draft'

export type LineStatus = 'unchecked' | 'match' | 'diff' | 'zero'
/** Bốn ô lọc của màn phiếu; "Lệch" gồm cả dòng "Không nhận" (số 0) — đều là sai khác so với phiếu. */
export type LineFilter = 'all' | 'unchecked' | 'match' | 'diff'

export type StatusOptions = {
  /**
   * Không phải checklist (chỉ xem — người không xác nhận được): không có dấu đã kiểm, mọi dòng so với
   * phiếu như thể đã kiểm (không sửa → khớp, sửa → lệch, số 0 → không nhận), bất kể `checked`.
   */
  ignoreChecked?: boolean
}

/** Dòng thêm trên máy (`base` null) là sai khác so với phiếu trên server → lệch. */
export function lineStatus(
  l: LocalLine,
  { ignoreChecked = false }: StatusOptions = {},
): LineStatus {
  if (!l.checked && !ignoreChecked) return 'unchecked'
  if (l.quantity === 0) return 'zero'
  if (l.base === null) return 'diff'
  return sameBase(lineValues(l), l.base) ? 'match' : 'diff'
}

export type Progress = {
  checked: number
  total: number
  diff: number
  zero: number
  unchecked: number
}

export function progress(lines: LocalLine[], opts?: StatusOptions): Progress {
  const p: Progress = { checked: 0, total: lines.length, diff: 0, zero: 0, unchecked: 0 }
  for (const l of lines) {
    const s = lineStatus(l, opts)
    if (s === 'unchecked') p.unchecked++
    else p.checked++
    if (s === 'diff') p.diff++
    if (s === 'zero') p.zero++
  }
  return p
}

export function filterLines(
  lines: LocalLine[],
  filter: LineFilter,
  opts?: StatusOptions,
): LocalLine[] {
  if (filter === 'all') return lines
  return lines.filter((l) => {
    const s = lineStatus(l, opts)
    return filter === 'diff' ? s === 'diff' || s === 'zero' : s === filter
  })
}
