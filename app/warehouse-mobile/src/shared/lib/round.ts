/** Số lượng: tối đa 6 chữ số lẻ. Làm tròn theo số nguyên để không sinh rác dấu phẩy động. */
export function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6
}

/**
 * Dung sai khi làm tròn xuống / lên ở 6 số lẻ (đơn vị 1e-6): sai số dấu phẩy động (vd 0,3 / 0,1 =
 * 2,9999999999999996) không được làm số đáng lẽ chia hết bị hạ / nâng thêm một bậc.
 */
const tolerance = (scaled: number) => Math.max(1e-6, Math.abs(scaled) * 1e-13)

/** Làm tròn XUỐNG ở 6 số lẻ — cho số "còn n" (nhập đúng số này thì không vượt). */
export function floor6(x: number): number {
  const scaled = x * 1e6
  return Math.floor(scaled + tolerance(scaled)) / 1e6
}

/** Làm tròn LÊN ở 6 số lẻ — cho số "thiếu n" (bớt đúng số này thì đủ). */
export function ceil6(x: number): number {
  const scaled = x * 1e6
  return Math.ceil(scaled - tolerance(scaled)) / 1e6
}

/** Tiền: tối đa 2 chữ số lẻ. */
export function round2(x: number): number {
  return Math.round(x * 100) / 100
}
