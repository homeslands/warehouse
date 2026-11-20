import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Image, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native'
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'

import { haptics } from '@/shared/lib/haptics'
import { useTheme } from '@/shared/theme/useTheme'

// Cùng file ảnh với splash gốc (`app.config.ts`).
const LOGO_LIGHT = require('../../assets/splash-icon.png')
const LOGO_DARK = require('../../assets/splash-icon-dark.png')

/** Khớp `imageWidth` của plugin `expo-splash-screen` trong `app.config.ts`. */
const LOGO = 200
/** Ảnh logo 1024px → pt trên màn. Mọi số đo dưới đây đo trên ảnh gốc (nền trong suốt). */
const K = LOGO / 1024
/** Cửa sổ cắt từng chữ S · o · k · o (ranh giới = giữa hai chữ, không chữ nào chạm nhau). */
const LETTERS = [
  [0, 296],
  [296, 531],
  [531, 745],
  [745, 1024],
].map(([x0, x1]) => ({ left: x0 * K, width: (x1 - x0) * K, center: ((x0 + x1) / 2) * K }))
/** Lỗ (lòng) chữ "o" cuối: tâm (859, 553.5)px, lòng 84×112px; elip nhỉnh hơn để mép nằm dưới nét mực. */
const HOLE = { x: 859 * K, y: 553.5 * K, rx: 50 * K, ry: 64 * K }
/** Vạch laser: cao hơn chữ một chút (mực chữ ở y 369–654px). */
const LASER = { top: 340 * K, height: 345 * K, from: -6, to: LOGO + 6 }

const HOLD_MS = 80
const SCAN_MS = 480
const HOP_UP_MS = 90
const HOP_DOWN_MS = 220
const PRESS_MS = 140
const IRIS_MS = 80
const ZOOM_MS = 380
/** Chữ thứ i được quét khi laser đi qua tâm chữ. */
const scanAt = (center: number) =>
  HOLD_MS + Math.round(((center - LASER.from) / (LASER.to - LASER.from)) * SCAN_MS)
const LAST_LAND = scanAt(LETTERS[3].center) + HOP_UP_MS + HOP_DOWN_MS
const PRESS_AT = LAST_LAND - 20
const REVEAL_AT = PRESS_AT + PRESS_MS
const ZOOM_AT = REVEAL_AT + IRIS_MS
export const LAUNCH_DURATION_MS = ZOOM_AT + ZOOM_MS
export const LAUNCH_REDUCED_MS = 250
export const LAUNCH_SKIP_MS = 150
/** Logo không bao giờ báo nạp xong (hiếm) → vẫn gỡ splash gốc sau ngần này, không kẹt ở splash. */
export const LAUNCH_FALLBACK_MS = 800

/**
 * Nền phủ màn `w×h` có khoét lỗ elip tâm `(cx, cy)`, bán kính `rx·s × ry·s` (evenodd); `s = 0` → nền đặc.
 * Vẽ lại mỗi khung thay vì phóng to ảnh nền → mép lỗ luôn sắc.
 */
export function holePath(
  w: number,
  h: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  s: number,
): string {
  'worklet'
  const rect = `M0 0H${w}V${h}H0Z`
  if (s <= 0) return rect
  const a = rx * s
  const b = ry * s
  return `${rect} M${cx - a} ${cy}a${a} ${b} 0 1 0 ${2 * a} 0a${a} ${b} 0 1 0 ${-2 * a} 0Z`
}

const AnimatedPath = Animated.createAnimatedComponent(Path)

export type LaunchOverlayProps = {
  /** Lớp phủ đã vẽ xong khung đầu (trùng splash gốc) → nơi gọi gỡ splash gốc. Gọi đúng một lần. */
  onShown: () => void
  /** Animation xong (hoặc bị chạm bỏ qua) → nơi gọi gỡ lớp phủ. Gọi đúng một lần. */
  onDone: () => void
}

/**
 * Lớp phủ lúc mở app (khởi động nguội), kể chuyện "quét mã": khung đầu TRÙNG splash gốc (nền
 * `background`, logo Soko 200pt giữa màn) nên gỡ splash gốc không thấy chỗ nối. Rồi vạch quét mảnh (trắng
 * đen, cùng màu chữ) chạy ngang logo, chữ nào bị quét thì nảy lên + rung nhẹ (S → o → k → o); logo co lấy
 * đà, lòng chữ "o" cuối mở ra (thấy app đã dựng sẵn bên dưới, rung "xong") rồi phóng xuyên qua lỗ đó
 * vào app (~1.3s). Chạm bất kỳ đâu → mờ nhanh vào app, chạm không lọt xuống app đang bị che. Ẩn khỏi
 * trình đọc màn hình. Reduce Motion: chỉ mờ dần, không laser / nảy / phóng / rung.
 */
export function LaunchOverlay({ onShown, onDone }: LaunchOverlayProps) {
  const { colors, scheme } = useTheme()
  const reduced = useReducedMotion()
  const window = useWindowDimensions()
  const [size, setSize] = useState({ w: window.width, h: window.height })
  const [shown, setShown] = useState(false)

  const fade = useSharedValue(1)
  const zoom = useSharedValue(1)
  const hole = useSharedValue(0)
  const laserX = useSharedValue(LASER.from)
  const laserOpacity = useSharedValue(0)

  // Callback mới nhất, không làm chạy lại effect hẹn giờ.
  const callbacks = useRef({ onShown, onDone })
  useLayoutEffect(() => {
    callbacks.current = { onShown, onDone }
  })
  const shownRef = useRef(false)
  const doneRef = useRef(false)
  const loaded = useRef(new Set<number>())
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const at = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms))
  }
  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    clearTimers()
    callbacks.current.onDone()
  }
  const show = () => {
    if (shownRef.current) return
    shownRef.current = true
    callbacks.current.onShown()
    setShown(true)
  }
  const onLetterLoad = (i: number) => {
    loaded.current.add(i)
    if (loaded.current.size === LETTERS.length) show()
  }
  const skip = () => {
    if (doneRef.current) return
    show()
    clearTimers()
    fade.value = withTiming(0, { duration: LAUNCH_SKIP_MS, easing: Easing.out(Easing.quad) })
    at(LAUNCH_SKIP_MS, finish)
  }

  useEffect(() => {
    const fallback = setTimeout(show, LAUNCH_FALLBACK_MS)
    return () => {
      clearTimeout(fallback)
      clearTimers()
    }
    // Chỉ hẹn một lần lúc gắn.
  }, [])

  useEffect(() => {
    if (!shown || doneRef.current) return
    if (reduced) {
      fade.value = withTiming(0, { duration: LAUNCH_REDUCED_MS, easing: Easing.linear })
      at(LAUNCH_REDUCED_MS, finish)
      return
    }
    // Đủ to để lỗ elip phủ cả màn từ bất kỳ tâm nào trên màn.
    const end = Math.ceil(Math.hypot(size.w, size.h) / HOLE.rx) + 4
    laserOpacity.value = withDelay(
      HOLD_MS,
      withSequence(
        withTiming(1, { duration: 60 }),
        withDelay(SCAN_MS - 140, withTiming(0, { duration: 80 })),
      ),
    )
    laserX.value = withDelay(
      HOLD_MS,
      withTiming(LASER.to, { duration: SCAN_MS, easing: Easing.linear }),
    )
    LETTERS.forEach((l) => at(scanAt(l.center), haptics.selection))
    zoom.value = withDelay(
      PRESS_AT,
      withSequence(
        withTiming(0.92, { duration: PRESS_MS, easing: Easing.out(Easing.cubic) }),
        withDelay(IRIS_MS, withTiming(end, { duration: ZOOM_MS, easing: Easing.in(Easing.cubic) })),
      ),
    )
    hole.value = withDelay(
      REVEAL_AT,
      withSequence(
        withTiming(0.92, { duration: IRIS_MS, easing: Easing.out(Easing.cubic) }),
        withTiming(end, { duration: ZOOM_MS, easing: Easing.in(Easing.cubic) }),
      ),
    )
    at(REVEAL_AT, haptics.success)
    at(LAUNCH_DURATION_MS, finish)
    // Chạy đúng một lần khi đã hiện; kích thước lấy lúc bắt đầu, shared value / hàm nội bộ ổn định.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, reduced])

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height })
  }

  // Tâm lỗ trên màn: logo 200pt căn giữa lớp phủ.
  const hx = size.w / 2 - LOGO / 2 + HOLE.x
  const hy = size.h / 2 - LOGO / 2 + HOLE.y
  const { w, h } = size
  const holeProps = useAnimatedProps(() => ({
    d: holePath(w, h, hx, hy, HOLE.rx, HOLE.ry, hole.value),
  }))
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }))
  const zoomStyle = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }))
  const laserStyle = useAnimatedStyle(() => ({
    opacity: laserOpacity.value,
    transform: [{ translateX: laserX.value }],
  }))

  const source = scheme === 'dark' ? LOGO_DARK : LOGO_LIGHT
  const animate = shown && !reduced

  return (
    <Animated.View
      testID="launch-overlay"
      onLayout={onLayout}
      onTouchStart={skip}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.top, fadeStyle]}
    >
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <AnimatedPath
          testID="launch-hole"
          animatedProps={holeProps}
          fill={colors.background}
          fillRule="evenodd"
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Animated.View
          testID="launch-zoom"
          style={[{ width: LOGO, height: LOGO, transformOrigin: [HOLE.x, HOLE.y, 0] }, zoomStyle]}
        >
          {LETTERS.map((l, i) => (
            <Letter
              key={i}
              index={i}
              left={l.left}
              width={l.width}
              source={source}
              delay={animate ? scanAt(l.center) : null}
              onLoad={() => onLetterLoad(i)}
              onError={show}
            />
          ))}
          {reduced ? null : <Laser color={colors.foreground} style={laserStyle} />}
        </Animated.View>
      </View>
    </Animated.View>
  )
}

type LetterProps = {
  index: number
  left: number
  width: number
  source: number
  /** ms tới lúc laser qua chữ này; `null` = đứng yên (chưa hiện / Reduce Motion). */
  delay: number | null
  onLoad: () => void
  onError: () => void
}

/** Một chữ cắt từ ảnh logo (khung `overflow: hidden`), nảy lên khi bị quét. */
function Letter({ index, left, width, source, delay, onLoad, onError }: LetterProps) {
  const lift = useSharedValue(0)
  const squash = useSharedValue(1)

  useEffect(() => {
    if (delay === null) return
    lift.value = withDelay(
      delay,
      withSequence(
        withTiming(-10, { duration: HOP_UP_MS, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: HOP_DOWN_MS, easing: Easing.out(Easing.back(2.2)) }),
      ),
    )
    squash.value = withDelay(
      delay,
      withSequence(
        withTiming(1.06, { duration: HOP_UP_MS }),
        withTiming(0.94, { duration: HOP_DOWN_MS / 2 }),
        withTiming(1, { duration: HOP_DOWN_MS / 2 }),
      ),
    )
  }, [delay, lift, squash])

  const hop = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }, { scaleY: squash.value }],
  }))
  const img = { position: 'absolute' as const, left: -left, top: 0, width: LOGO, height: LOGO }

  return (
    <Animated.View
      style={[
        { position: 'absolute', left, top: 0, width, height: LOGO, overflow: 'hidden' },
        { transformOrigin: 'center bottom' },
        hop,
      ]}
    >
      <Image
        testID={`launch-letter-img-${index}`}
        source={source}
        style={img}
        resizeMode="contain"
        fadeDuration={0}
        onLoad={onLoad}
        onError={onError}
      />
    </Animated.View>
  )
}

/** Vạch quét mảnh cùng màu chữ (đen trên nền sáng / trắng trên nền tối), chạy ngang qua logo. */
function Laser({ color, style }: { color: string; style: ReturnType<typeof useAnimatedStyle> }) {
  return (
    <Animated.View
      testID="launch-laser"
      style={[
        {
          position: 'absolute',
          left: -1,
          top: LASER.top,
          width: 2,
          height: LASER.height,
          borderRadius: 1,
          backgroundColor: color,
        },
        style,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  top: { zIndex: 1000, elevation: 1000 },
  center: { alignItems: 'center', justifyContent: 'center' },
})
