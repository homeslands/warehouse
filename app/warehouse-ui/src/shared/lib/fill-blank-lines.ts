/**
 * Thêm `incoming` vào danh sách dòng của form: lấp các dòng TRỐNG HẲN (`isBlank`) theo thứ tự trước, phần còn lại nối
 * cuối, không vượt `max` (bỏ phần thừa). Dòng không đổi giữ nguyên tham chiếu (bên gọi chỉ cập nhật dòng đổi).
 * `firstNewIndex` = dòng được lấp / thêm đầu tiên, `null` nếu không thêm gì.
 */
export function fillBlankLines<T>(
  lines: T[],
  incoming: T[],
  isBlank: (line: T) => boolean,
  max: number,
): { lines: T[]; firstNewIndex: number | null } {
  const next = [...lines]
  let firstNewIndex: number | null = null
  let cursor = 0
  for (const line of incoming) {
    // Chỉ dò trong các dòng có sẵn (dòng vừa nối thêm không bao giờ được lấp lại).
    while (cursor < lines.length && !isBlank(lines[cursor] as T)) cursor++
    if (cursor < lines.length) {
      next[cursor] = line
      firstNewIndex ??= cursor
      cursor++
      continue
    }
    if (next.length >= max) break
    firstNewIndex ??= next.length
    next.push(line)
  }
  return { lines: next, firstNewIndex }
}
