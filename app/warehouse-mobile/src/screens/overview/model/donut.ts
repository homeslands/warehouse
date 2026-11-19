/** Góc tính theo phần vòng [0,1), bắt đầu từ đỉnh, theo chiều kim đồng hồ. */
export type DonutSlice = {
  key: 'out' | 'low' | 'high' | 'ok'
  value: number
  start: number
  end: number
}

const ORDER = ['out', 'low', 'high', 'ok'] as const

export function donutSlices(
  counts: { out: number; low: number; high: number; ok: number },
  opts: { gap?: number; minFraction?: number } = {},
): DonutSlice[] {
  const gap = opts.gap ?? 0.012
  const min = opts.minFraction ?? 0.02
  const items = ORDER.map((key) => ({ key, value: counts[key] })).filter((i) => i.value > 0)
  const n = items.length
  if (n === 0) return []
  if (n === 1) return [{ ...items[0], start: 0, end: 1 }]

  // Đoạn quá nhỏ được ghim ở `min`, phần còn lại chia tỉ lệ → mọi đoạn ≥ min, tổng = 1 − gap×n.
  const available = 1 - gap * n
  const pinned = new Set<number>()
  let lengths: number[] = []
  for (;;) {
    const rest = items.reduce((s, it, i) => (pinned.has(i) ? s : s + it.value), 0)
    const room = available - pinned.size * min
    lengths = items.map((it, i) => (pinned.has(i) ? min : (it.value / rest) * room))
    const tooSmall = lengths.findIndex((l, i) => !pinned.has(i) && l < min)
    if (tooSmall === -1) break
    items.forEach((_, i) => {
      if (!pinned.has(i) && lengths[i] < min) pinned.add(i)
    })
  }

  let cursor = 0
  return items.map((it, i) => {
    const start = cursor
    const end = start + lengths[i]
    cursor = end + gap
    return { ...it, start, end }
  })
}

/** Phần trăm hàng "đủ", làm tròn XUỐNG (999/1000 không được hiện 100%); kho trống → null. */
export function okPercent(counts: { total: number; ok: number }): number | null {
  if (counts.total <= 0) return null
  // Nhân trước rồi chia: (29 / 100) * 100 = 28.999… → floor sai thành 28.
  return Math.floor((counts.ok * 100) / counts.total)
}
