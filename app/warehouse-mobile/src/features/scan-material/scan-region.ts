/** Vùng nhận mã (khung ngắm) trong toạ độ của khung camera — cùng hệ với `bounds` / `cornerPoints`. */
export type ScanRegion = { x: number; y: number; width: number; height: number }

type Point = { x: number; y: number }
type Box = { x: number; y: number; width: number; height: number }
/** Phần vị trí của kết quả quét mà camera trả (iOS và Android đều đã đổi sang toạ độ của khung camera). */
export type BarcodeGeometry = {
  cornerPoints?: Point[] | null
  bounds?: { origin: Point; size: { width: number; height: number } } | null
}

/** Nới khung ngắm khi xét mã (pt): mã chạm sát mép khung vẫn được tính là trong khung. */
export const REGION_SLACK = 8
/** Tỉ lệ diện tích mã tối thiểu phải nằm trong khung ngắm (đã nới) — mã lọt một phần ở mép bị bỏ. */
export const MIN_INSIDE = 0.8

/** Khung bao của mã: từ các góc; không có góc thì `bounds`; không có gì dùng được → `null`. */
export function barcodeBox(result: BarcodeGeometry): Box | null {
  const points = result.cornerPoints ?? []
  if (points.length > 0) {
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
  }
  const b = result.bounds
  if (b && b.size.width > 0 && b.size.height > 0) {
    return { x: b.origin.x, y: b.origin.y, width: b.size.width, height: b.size.height }
  }
  return null
}

/** Tâm mã (tâm khung bao) — `null` khi máy không trả vị trí. */
export function barcodeCenter(result: BarcodeGeometry): Point | null {
  const box = barcodeBox(result)
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null
}

/**
 * Có nhận mã này không: chỉ nhận mã nằm GỌN trong khung ngắm — ít nhất `MIN_INSIDE` diện tích khung bao
 * của mã nằm trong khung (nới `REGION_SLACK`). Camera đọc mọi mã trong cả khung hình: nhãn khác lọt ở
 * mép vùng tối, hay chỉ một phần nhãn lướt vào khung khi đưa máy lên, đều không được tính (lỗi 2026-11-18).
 * Mã có khung bao suy biến (diện tích 0, vd chỉ 1 điểm) → xét tâm. Không lọc (nhận như cũ) khi: chưa có
 * vùng / chưa đo khung camera / máy không trả vị trí / tâm nằm ngoài khung camera (toạ độ lạ) — tránh chặn
 * nhầm mọi lần quét.
 */
export function acceptsBarcode(
  result: BarcodeGeometry,
  region: ScanRegion | null | undefined,
  view: { width: number; height: number } | null,
): boolean {
  if (!region || !view || view.width <= 0 || view.height <= 0) return true
  const box = barcodeBox(result)
  if (!box) return true
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  if (cx < 0 || cy < 0 || cx > view.width || cy > view.height) return true
  const left = region.x - REGION_SLACK
  const top = region.y - REGION_SLACK
  const right = region.x + region.width + REGION_SLACK
  const bottom = region.y + region.height + REGION_SLACK
  const area = box.width * box.height
  if (area <= 0) return cx >= left && cx <= right && cy >= top && cy <= bottom
  const iw = Math.max(0, Math.min(box.x + box.width, right) - Math.max(box.x, left))
  const ih = Math.max(0, Math.min(box.y + box.height, bottom) - Math.max(box.y, top))
  return (iw * ih) / area >= MIN_INSIDE
}
