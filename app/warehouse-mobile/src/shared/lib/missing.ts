/** Nơi "Tới" đưa người dùng tới để điền phần còn thiếu của phiếu. */
export type MissingTarget =
  | { kind: 'header'; field: string }
  | { kind: 'line'; key: string; field: 'quantity' | 'price' | 'expiry' | 'line' }
  /** Chưa có dòng nào → mở bộ chọn vật tư. */
  | { kind: 'lines' }

/** `group`: khoá gộp để tóm tắt ("receiver", "price", "quantity", "expiry", "lines", "tooMany", "duplicate"…). */
export type MissingItem = { id: string; group: string; target: MissingTarget }

/**
 * Tóm tắt "Còn n mục · …": gộp theo `group` theo thứ tự xuất hiện, nối ", "; quá `max` nhóm thì
 * cắt và thêm "…".
 */
export function missingSummary(
  items: readonly MissingItem[],
  label: (group: string, n: number) => string,
  max = 3,
): string {
  const counts = new Map<string, number>()
  for (const i of items) counts.set(i.group, (counts.get(i.group) ?? 0) + 1)
  const parts = [...counts].map(([group, n]) => label(group, n))
  return parts.slice(0, max).join(', ') + (parts.length > max ? '…' : '')
}

/**
 * Phần còn thiếu của MỘT bước trong form 3 bước (spec §3.4): bước 1 = ô đầu phiếu (`header`), bước 2 =
 * mọi mục còn lại (`line` / `lines` — số lượng, đơn giá, hạn dùng, trùng, quá dòng, chưa có dòng). Giữ
 * thứ tự của `items`.
 */
export function missingForStep(items: readonly MissingItem[], step: 1 | 2): MissingItem[] {
  return items.filter((i) => (i.target.kind === 'header') === (step === 1))
}

/**
 * Bước 2 dạng dòng chỉ đọc (spec wizard-apple §6): từ phần thiếu của bước 2 → `incomplete` = khoá các dòng
 * có mục "còn thiếu" (số lượng, đơn giá, hạn dùng, trùng…), MỖI dòng một lần, theo THỨ TỰ DANH SÁCH
 * `lineKeys` ("k chưa đủ", đích của chạm-mở-sheet); `other` = mục không thuộc riêng dòng nào ("chưa có
 * dòng", "quá số dòng").
 */
export function lineGaps(
  items: readonly MissingItem[],
  lineKeys: readonly string[],
): { incomplete: string[]; other: MissingItem[] } {
  const keys = new Set<string>()
  const other: MissingItem[] = []
  for (const i of items) {
    if (i.target.kind === 'line' && i.group !== 'tooMany') keys.add(i.target.key)
    else other.push(i)
  }
  return { incomplete: lineKeys.filter((k) => keys.has(k)), other }
}
