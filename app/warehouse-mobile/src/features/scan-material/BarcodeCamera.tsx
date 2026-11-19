import { CameraView, type BarcodeScanningResult, type BarcodeType } from 'expo-camera'
import { useEffect, useRef } from 'react'
import { StyleSheet } from 'react-native'

import { acceptsBarcode, type ScanRegion } from './scan-region'
import { scanTiming } from './scan-timing'

/**
 * Các loại mã đã chốt (spec §8): mã vạch 1D thường gặp + QR. KHÔNG đọc Code39 (bỏ 2026-11-18): trên iOS
 * expo-camera đọc Code39 bằng ZXing quét cả khung hình và KHÔNG trả vị trí, nên không lọc được theo khung
 * ngắm (nhãn ngoài khung bị bắt dính); nhãn nội bộ `<MÃ>*<SERIAL>` cũng không thể là Code39 (`*` là ký tự
 * mở / đóng của chuẩn đó).
 */
const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'code128', 'qr']

export type BarcodeCameraProps = {
  /** `false`: camera hiện nhưng chưa đọc mã (vd đang chờ dữ liệu). */
  active: boolean
  /** Gọi đúng MỘT lần với mã đầu tiên đọc được (khoá đồng bộ — camera bắn nhiều sự kiện liền nhau). */
  onScanned: (data: string) => void
  /**
   * Quét liên tục: gọi `onScanned` mỗi lần đọc, nhưng nội dung (đã trim) đã nhận chỉ được nhận lại khi đã
   * VẮNG khỏi camera ≥ 2 s — mỗi lần đọc lại nó (kể cả lần bị bỏ) làm mới mốc, nên nhãn để yên trong khung
   * không bị cộng lặp; đọc nội dung khác KHÔNG mở lại (hai nhãn cùng trong khung đọc xen kẽ vẫn bị chặn).
   * Giữa hai lần nhận bất kỳ cách tối thiểu 700 ms.
   */
  continuous?: boolean
  /** Bật đèn pin (`CameraView enableTorch`); mặc định tắt. */
  torch?: boolean
  /**
   * Chỉ ở chế độ `continuous`: một lần đọc bị bỏ vì CÙNG nội dung còn trong cửa sổ chặn, khi đã quá
   * `scanTiming.repeatHintMs` kể từ lần nhận nội dung đó (nhãn để yên trong khung — người dùng có vẻ chờ
   * cộng thêm; ngay sau khi nhận thì KHÔNG báo) → gọi tối đa MỘT lần cho mỗi lần nhận nội dung đó.
   */
  onRepeat?: (data: string) => void
  /**
   * Khung ngắm (toạ độ của khung camera): chỉ nhận mã nằm GỌN trong đó — camera đọc mọi mã trong cả khung
   * hình, nhãn khác lọt ở mép / chỉ lướt một phần vào khung không được tính (xem `acceptsBarcode`). Không
   * truyền → nhận mọi mã.
   */
  region?: ScanRegion | null
  /**
   * Đang "khoá" một mã: đã thấy trong khung nhưng chưa đủ thời gian giữ yên (`scanTiming.dwellMs`) — màn
   * quét đổi màu khung. `false` khi mã được nhận hoặc vắng quá `scanTiming.gapMs`.
   */
  onLockChange?: (locked: boolean) => void
}

/** Quét liên tục: nội dung đã nhận phải vắng khỏi camera ít nhất khoảng này mới được nhận lại. */
const SAME_CODE_MS = 2000
/** Quét liên tục: khoảng cách tối thiểu giữa hai lần nhận. */
const ANY_CODE_MS = 700

/** Đồng hồ đơn điệu (không nhảy khi đổi giờ máy); thiếu `performance.now` thì dùng `Date.now`. */
const clock = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

/**
 * Camera thuần của các màn quét: `CameraView` phủ kín cha (cha tự lo khung, overlay, quyền camera —
 * xem `ScanScreen`), đọc mã vạch/QR. Chỉ nhận mã nằm gọn trong khung ngắm (`region`) VÀ giữ yên đủ lâu
 * (`scanTiming`), rồi chống đọc lặp (một lần / liên tục).
 */
export function BarcodeCamera({
  active,
  onScanned,
  continuous,
  torch = false,
  onRepeat,
  region,
  onLockChange,
}: BarcodeCameraProps) {
  // Vùng mới nhất + cỡ khung camera (đo `onLayout`) cho `onBarcode`, không phải tạo lại hàm.
  const regionRef = useRef(region)
  useEffect(() => {
    regionRef.current = region
  })
  const viewSize = useRef<{ width: number; height: number } | null>(null)
  const handled = useRef(false)
  const lastAny = useRef<number | null>(null)
  /** Nội dung đã nhận → lần cuối camera THẤY nó (kể cả lần bị bỏ). */
  const lastSeen = useRef(new Map<string, number>())
  /** Nội dung đã báo `onRepeat` kể từ lần nhận gần nhất của nó. */
  const repeated = useRef(new Set<string>())
  /** Nội dung đã nhận → lúc nhận (để chỉ báo `onRepeat` khi nhãn còn trong khung quá `repeatHintMs`). */
  const acceptedAt = useRef(new Map<string, number>())
  /** Giữ yên: nội dung đang thấy trong khung → lần đầu / lần gần nhất thấy (liên tục, không vắng quá `gapMs`). */
  const pending = useRef(new Map<string, { first: number; last: number }>())
  const locked = useRef(false)
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onLockRef = useRef(onLockChange)
  useEffect(() => {
    onLockRef.current = onLockChange
  })
  const setLocked = (next: boolean) => {
    if (lockTimer.current) clearTimeout(lockTimer.current)
    lockTimer.current = null
    // Đang khoá mà không đọc thêm được nữa (mã đã rời khung) → tự tắt sau `gapMs`.
    if (next) lockTimer.current = setTimeout(() => setLocked(false), scanTiming.gapMs)
    if (locked.current === next) return
    locked.current = next
    onLockRef.current?.(next)
  }
  useEffect(
    () => () => {
      if (lockTimer.current) clearTimeout(lockTimer.current)
    },
    [],
  )

  /**
   * Giữ yên: mã phải được thấy trong khung liên tục ≥ `dwellMs` (mỗi nội dung đếm riêng; vắng quá `gapMs`
   * thì đếm lại) — chặn mã chỉ lướt qua khung khi đang đưa máy lên. `dwellMs` 0 → nhận ngay.
   */
  const steady = (text: string, now: number): boolean => {
    const { dwellMs, gapMs } = scanTiming
    for (const [key, seen] of pending.current) {
      if (now - seen.last > gapMs) pending.current.delete(key)
    }
    const seen = pending.current.get(text)
    if (seen) seen.last = now
    else pending.current.set(text, { first: now, last: now })
    const first = seen?.first ?? now
    if (now - first < dwellMs) {
      setLocked(true)
      return false
    }
    setLocked(false)
    return true
  }

  const onBarcode = (result: BarcodeScanningResult) => {
    // Mã ngoài khung ngắm: bỏ hẳn (không tính là "đã thấy", không báo lặp, không khoá).
    if (!acceptsBarcode(result, regionRef.current, viewSize.current)) return
    const { data } = result
    const now = clock()
    const text = data.trim()
    if (handled.current || !steady(text, now)) return
    if (continuous) {
      const seen = lastSeen.current.get(text)
      if (seen !== undefined && now - seen < SAME_CODE_MS) {
        lastSeen.current.set(text, now) // còn trong khung → giữ chặn
        const since = now - (acceptedAt.current.get(text) ?? now)
        if (since >= scanTiming.repeatHintMs && !repeated.current.has(text)) {
          repeated.current.add(text)
          onRepeat?.(data)
        }
        return
      }
      // Bỏ vì quá sát lần nhận trước: không ghi mốc (nội dung chưa nhận không bị giữ lại).
      if (lastAny.current !== null && now - lastAny.current < ANY_CODE_MS) return
      lastAny.current = now
      lastSeen.current.set(text, now)
      acceptedAt.current.set(text, now)
      repeated.current.delete(text)
      onScanned(data)
      return
    }
    handled.current = true
    onScanned(data)
  }

  return (
    <CameraView
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        viewSize.current = { width, height }
      }}
      facing="back"
      enableTorch={torch}
      barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
      onBarcodeScanned={active ? onBarcode : undefined}
    />
  )
}
