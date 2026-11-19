const two = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`

/** `n` ngày `YYYY-MM-DD` giờ máy, cũ → mới; phần tử cuối = ngày của `now`. */
export function lastDays(now: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i))),
  )
}

const VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function weekdayShort(day: string, lng: 'vi' | 'en'): string {
  const [y, m, d] = day.split('-').map(Number)
  const w = new Date(y, m - 1, d).getDay()
  return (lng === 'vi' ? VI : EN)[w]
}

/** Trục tròn: max ≥ max(1, giá trị), tối đa 3 khoảng với bước 1/2/5×10^k. */
export function niceMax(max: number): { max: number; ticks: number[] } {
  const m = Number.isFinite(max) ? Math.max(1, max) : 1
  let step = 1
  for (let e = 1; ; e *= 10) {
    const found = [1, 2, 5].map((f) => f * e).find((s) => Math.ceil(m / s) <= 3)
    if (found) {
      step = found
      break
    }
  }
  const intervals = Math.ceil(m / step)
  return { max: intervals * step, ticks: Array.from({ length: intervals + 1 }, (_, i) => i * step) }
}
