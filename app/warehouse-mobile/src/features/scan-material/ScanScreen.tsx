import { BlurView } from 'expo-blur'
import { useCameraPermissions } from 'expo-camera'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AppState, Linking, Platform, StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'

import { Button, GlassCircleButton, Text } from '@/shared/ui'
import { Flashlight, FlashlightOff, ScanBarcode, X } from '@/shared/ui/icons'

import { BarcodeCamera } from './BarcodeCamera'

export type ScanScreenProps = {
  /** testID của gốc màn (mặc định `scan-screen`). */
  testID?: string
  /** Đã có dữ liệu để so mã — `false`: camera hiện nhưng chưa đọc. */
  active: boolean
  /** Quét liên tục (xem `BarcodeCamera`). */
  continuous?: boolean
  onScanned: (data: string) => void
  /** Quét liên tục: nội dung vẫn còn trong khung bị bỏ qua (gọi một lần mỗi lần nhận) — xem `BarcodeCamera`. */
  onRepeat?: (data: string) => void
  onClose: () => void
  /** Chữ dưới khung ngắm (đã dịch). */
  hint: string
  /**
   * Nội dung thẻ mờ nổi ở đáy (nền tối → chữ TRẮNG, vd `style={{ color: SCAN_TEXT }}`); vắng = không thẻ.
   */
  bottom?: ReactNode
  /**
   * Màn đặt sau mỗi lần xử lý: khung chớp xanh (`success`) / đỏ (`error`) ~350 ms; Reduce Motion → không
   * chớp. Chớp khi `flash` (khác `null`) hoặc `flashKey` đổi — muốn chớp lại CÙNG loại thì đổi `flashKey`.
   */
  flash?: 'success' | 'error' | null
  /** Đổi để chớp lại cùng loại `flash` (vd số lần đã quét). */
  flashKey?: number | string
  /**
   * Thẻ đáy đang mở rộng: khung giữ vị trí theo lần đo ở trạng thái thu gọn gần nhất, camera tạm không
   * đọc, vùng tối phủ đậm hơn (thẻ được phép che khung).
   */
  bottomExpanded?: boolean
}

/** Màu chữ trên nền tối của màn quét (thẻ đáy, gợi ý). */
export const SCAN_TEXT = '#ffffff'
/** Chữ phụ trên nền tối của màn quét. */
export const SCAN_TEXT_MUTED = 'rgba(255,255,255,0.72)'

const DIM = 'rgba(0,0,0,0.55)'
const BUTTON = 44
const FRAME_MAX = 300
const FRAME_MIN = 180
/** Chỗ dành cho dòng gợi ý dưới khung. */
const HINT_SPACE = 40
/** Khoảng hở giữa hàng nút trên và vùng ngắm. */
const TOP_GAP = 16
/** Lề dưới của thẻ đáy (cộng inset dưới). */
const CARD_MARGIN = 12
/** Lớp tối thêm khi thẻ mở rộng (camera tạm dừng). */
const DIM_EXPANDED = 'rgba(0,0,0,0.35)'
/** Bán kính lỗ khoét (vùng quét). */
const HOLE_RADIUS = 20
/** 4 góc trắng lùi ra ngoài lỗ khoét khoảng này; bán kính góc = bán kính lỗ + gap (đồng tâm). */
const CORNER_GAP = 10
const CORNER = 36
const CORNER_WIDTH = 3
const BREATH_MS = 800
const FLASH_MS = 350
/** Vàng hệ thống (dark) — icon đèn pin khi đang bật. */
const TORCH_ON = '#FFD60A'
const FLASH_COLOR = { success: '#30D158', error: '#FF453A' } as const
/** Góc khung khi đang "khoá" một mã (đã thấy trong khung, đang chờ giữ yên đủ lâu). */
const LOCK_COLOR = '#FFD60A'

/** Đường tô: cả màn trừ hình chữ nhật bo góc ở giữa (`fillRule="evenodd"` → lỗ khoét). */
function dimPath(width: number, height: number, cy: number, size: number, r: number): string {
  const x = (width - size) / 2
  const y = cy - size / 2
  const e = x + size
  const b = y + size
  return (
    `M0 0H${width}V${height}H0Z` +
    `M${x + r} ${y}H${e - r}A${r} ${r} 0 0 1 ${e} ${y + r}V${b - r}A${r} ${r} 0 0 1 ${e - r} ${b}` +
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${b - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  )
}

/** 4 góc trắng dày, lùi ra ngoài lỗ khoét `CORNER_GAP`, "thở" nhẹ (opacity + scale); Reduce Motion → tĩnh. */
function Corners({ locked = false }: { locked?: boolean }) {
  const reduced = useReducedMotion()
  const breath = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) {
      cancelAnimation(breath)
      breath.value = 1
      return
    }
    breath.value = 0
    breath.value = withRepeat(
      withTiming(1, { duration: BREATH_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    )
    return () => cancelAnimation(breath)
  }, [reduced, breath])
  const style = useAnimatedStyle(() => ({
    opacity: reduced ? 1 : 0.55 + 0.45 * breath.value,
    transform: [{ scale: reduced ? 1 : 1 + 0.03 * breath.value }],
  }))
  const corner = (pos: object, edges: object) => (
    <View
      style={[
        {
          position: 'absolute',
          width: CORNER,
          height: CORNER,
          borderColor: locked ? LOCK_COLOR : '#ffffff',
        },
        pos,
        edges,
      ]}
    />
  )
  const w = CORNER_WIDTH
  const r = HOLE_RADIUS + CORNER_GAP
  return (
    <Animated.View
      testID="scan-corners"
      style={[
        { position: 'absolute', top: -CORNER_GAP, left: -CORNER_GAP, right: -CORNER_GAP },
        { bottom: -CORNER_GAP },
        style,
      ]}
    >
      {corner(
        { top: 0, left: 0 },
        { borderTopWidth: w, borderLeftWidth: w, borderTopLeftRadius: r },
      )}
      {corner(
        { top: 0, right: 0 },
        { borderTopWidth: w, borderRightWidth: w, borderTopRightRadius: r },
      )}
      {corner(
        { bottom: 0, left: 0 },
        { borderBottomWidth: w, borderLeftWidth: w, borderBottomLeftRadius: r },
      )}
      {corner(
        { bottom: 0, right: 0 },
        { borderBottomWidth: w, borderRightWidth: w, borderBottomRightRadius: r },
      )}
    </Animated.View>
  )
}

/** Viền khung chớp màu khi màn báo kết quả, bám theo lỗ khoét (bỏ khi Reduce Motion). */
function FlashRing({ flash, flashKey }: Pick<ScanScreenProps, 'flash' | 'flashKey'>) {
  const reduced = useReducedMotion()
  const opacity = useSharedValue(0)
  useEffect(() => {
    if (!flash || reduced) {
      opacity.value = 0
      return
    }
    opacity.value = 1
    opacity.value = withTiming(0, { duration: FLASH_MS })
  }, [flash, flashKey, reduced, opacity])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  if (!flash) return null
  return (
    <Animated.View
      testID="scan-flash"
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: HOLE_RADIUS,
          borderWidth: CORNER_WIDTH,
          borderColor: FLASH_COLOR[flash],
        },
        style,
      ]}
    />
  )
}

/**
 * Overlay: vùng tối phủ cả màn trừ lỗ khoét bo góc ở giữa (một `Svg` + `Path` evenodd — iOS vẽ đúng, không
 * dùng View viền dày), 4 góc trắng lùi ra ngoài lỗ `CORNER_GAP`, gợi ý dưới khung. Không nhận chạm.
 */
function Viewfinder({
  size,
  cy,
  hint,
  flash,
  flashKey,
  expanded,
  locked,
}: {
  locked: boolean
  size: number
  /** Tung độ tâm khung ngắm. */
  cy: number
  hint: string
  expanded: boolean
} & Pick<ScanScreenProps, 'flash' | 'flashKey'>) {
  const { width, height } = useWindowDimensions()
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg
        aria-hidden
        testID="scan-dim"
        width={width}
        height={height}
        style={StyleSheet.absoluteFill}
      >
        <Path
          testID="scan-dim-path"
          d={dimPath(width, height, cy, size, HOLE_RADIUS)}
          fill={DIM}
          fillRule="evenodd"
        />
      </Svg>
      {expanded ? (
        <View
          testID="scan-dim-expanded"
          style={[StyleSheet.absoluteFill, { backgroundColor: DIM_EXPANDED }]}
        />
      ) : null}
      <View
        aria-hidden
        testID="scan-frame"
        style={{
          position: 'absolute',
          top: cy - size / 2,
          left: (width - size) / 2,
          width: size,
          height: size,
        }}
      >
        <Corners locked={locked} />
        <FlashRing flash={flash} flashKey={flashKey} />
      </View>
      <View
        style={{
          position: 'absolute',
          top: cy + size / 2 + CORNER_GAP + 20,
          left: 32,
          right: 32,
          alignItems: 'center',
        }}
      >
        <Text weight="semibold" size={15} style={{ color: SCAN_TEXT, textAlign: 'center' }}>
          {hint}
        </Text>
      </View>
    </View>
  )
}

/** Nút tròn 44 trên camera: kính (iOS 26+, `GlassCircleButton`) hoặc tròn đen mờ; icon trắng. */
function RoundButton({
  label,
  onPress,
  icon,
  testID,
}: {
  label: string
  onPress: () => void
  icon: ReactNode
  testID: string
}) {
  return (
    <GlassCircleButton
      label={label}
      onPress={onPress}
      size={BUTTON}
      icon={icon}
      fallbackColor="rgba(0,0,0,0.5)"
      fallbackTestID={testID}
    />
  )
}

/** Chưa có quyền camera: icon + tiêu đề + mô tả + nút xin quyền / mở Cài đặt, giữa màn đen. */
function PermissionPrompt({ canAsk, onAsk }: { canAsk: boolean; onAsk: () => void }) {
  const { t } = useTranslation(['inventory'])
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
      ]}
    >
      <View
        aria-hidden
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.14)',
        }}
      >
        <ScanBarcode size={30} strokeWidth={1.8} color={SCAN_TEXT} />
      </View>
      <Text weight="semibold" size={17} style={{ color: SCAN_TEXT, textAlign: 'center' }}>
        {t('inventory:cameraTitle')}
      </Text>
      <Text size={14} style={{ color: SCAN_TEXT_MUTED, textAlign: 'center' }}>
        {canAsk ? t('inventory:cameraBody') : t('inventory:cameraDeniedBody')}
      </Text>
      <Button
        variant="accent"
        capsule
        style={{ alignSelf: 'stretch', marginTop: 8 }}
        onPress={onAsk}
      >
        {canAsk ? t('inventory:cameraAllow') : t('inventory:cameraOpenSettings')}
      </Button>
    </View>
  )
}

/**
 * Khung toàn màn chung của các màn quét (chuẩn camera iOS): camera tràn viền trên nền đen, thanh trạng
 * thái chữ trắng, nút tròn ✕ (trái trên) + đèn pin (phải trên, chỉ khi có quyền), khung ngắm vuông bo
 * góc ở giữa (ngoài khung tối mờ, lỗ khoét bo tròn bằng Svg) + gợi ý, thẻ vật liệu mờ nổi ở đáy (nội dung do màn truyền). Tự xin
 * quyền camera (bị từ chối hẳn → mở Cài đặt); ✕ luôn đóng được. Đèn pin là state cục bộ — rời màn
 * (unmount) là tắt. Tự ẩn header của Stack đang chứa nó.
 */
export function ScanScreen({
  testID = 'scan-screen',
  active,
  continuous,
  onScanned,
  onRepeat,
  onClose,
  hint,
  bottom,
  flash = null,
  flashKey,
  bottomExpanded = false,
}: ScanScreenProps) {
  const { t } = useTranslation(['inventory', 'common'])
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const reduced = useReducedMotion()
  // Chiều cao thẻ đáy đo ở trạng thái THU GỌN gần nhất; mở rộng thì giữ nguyên (khung không nhảy).
  const [cardHeight, setCardHeight] = useState<number | null>(null)
  const [permission, requestPermission, getPermission] = useCameraPermissions()
  const [torch, setTorch] = useState(false)
  // Camera đang khoá một mã (chờ giữ yên) → góc khung vàng.
  const [locked, setLocked] = useState(false)
  const granted = !!permission?.granted
  // Từ chối hẳn → người dùng bật quyền trong Cài đặt rồi quay lại app: đọc lại quyền (không hiện hộp xin).
  const getPermissionRef = useRef(getPermission)
  useEffect(() => {
    getPermissionRef.current = getPermission
  }, [getPermission])
  useEffect(() => {
    if (granted) return
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void getPermissionRef.current()
    })
    return () => sub.remove()
  }, [granted])
  let frame = Math.min(Math.round(width * 0.7), FRAME_MAX)
  let cy = height / 2
  if (bottom && cardHeight !== null) {
    const areaTop = insets.top + 8 + BUTTON + TOP_GAP
    const areaBottom = height - insets.bottom - CARD_MARGIN - cardHeight
    const room = areaBottom - areaTop
    frame = Math.max(FRAME_MIN, Math.min(frame, Math.round(room - HINT_SPACE)))
    cy = areaTop + (room - (frame + HINT_SPACE)) / 2 + frame / 2
  }
  const ios = Platform.OS === 'ios'

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: '#000000', overflow: 'hidden' }}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      {granted ? (
        <>
          <BarcodeCamera
            active={active && !bottomExpanded}
            continuous={continuous}
            torch={torch}
            onScanned={onScanned}
            onRepeat={onRepeat}
            // Chỉ nhận mã nằm trong khung ngắm (khung camera phủ kín màn này, cùng hệ toạ độ).
            region={{ x: (width - frame) / 2, y: cy - frame / 2, width: frame, height: frame }}
            onLockChange={setLocked}
          />
          <Viewfinder
            size={frame}
            cy={cy}
            hint={hint}
            flash={flash}
            flashKey={flashKey}
            expanded={bottomExpanded}
            locked={locked && active && !bottomExpanded}
          />
        </>
      ) : permission ? (
        <PermissionPrompt
          canAsk={permission.canAskAgain}
          onAsk={() => void (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
        />
      ) : null}

      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 16,
          right: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <RoundButton
          testID="scan-close"
          label={t('common:close')}
          onPress={onClose}
          icon={<X size={22} strokeWidth={2.4} color={SCAN_TEXT} />}
        />
        {granted ? (
          <RoundButton
            testID="scan-torch"
            label={torch ? t('inventory:torchOff') : t('inventory:torchOn')}
            onPress={() => setTorch((v) => !v)}
            icon={
              torch ? (
                <Flashlight size={22} strokeWidth={2.2} color={TORCH_ON} fill={TORCH_ON} />
              ) : (
                <FlashlightOff size={22} strokeWidth={2.2} color={SCAN_TEXT} />
              )
            }
          />
        ) : null}
      </View>

      {bottom ? (
        <Animated.View
          testID="scan-screen-card"
          layout={reduced ? undefined : LinearTransition.duration(250)}
          onLayout={(e) => {
            if (!bottomExpanded) setCardHeight(e.nativeEvent.layout.height)
          }}
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: insets.bottom + CARD_MARGIN,
            borderRadius: 28,
            overflow: 'hidden',
            backgroundColor: ios ? undefined : 'rgba(0,0,0,0.6)',
          }}
        >
          {ios ? (
            <BlurView tint="systemChromeMaterialDark" style={StyleSheet.absoluteFill} />
          ) : null}
          <View style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 10 }}>{bottom}</View>
        </Animated.View>
      ) : null}
    </View>
  )
}
