import { Trash2 } from '../icons'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  Pressable,
  useWindowDimensions,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native'
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable'
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

import { haptics } from '../../lib/haptics'
import { motion } from '../../lib/motion'
import { useTheme } from '../../theme/useTheme'

/** Bề rộng vùng lộ ra khi vuốt: nút tròn 44pt + lề hai bên. */
const ACTION_WIDTH = 72
const BUTTON_SIZE = 44
/** Vuốt quá vùng nút: thẻ chỉ đi theo 1/4 quãng tay kéo (độ "dẻo" kiểu iOS). */
const OVERSHOOT_FRICTION = 4
/** Lò xo khi thả tay: hơi nảy khi mở / đóng (Reduce Motion → hệ thống tắt hẳn). */
const SNAP_SPRING = { mass: 1, damping: 20, stiffness: 240, overshootClamping: false } as const
/** Sau khi thả tay vuốt, bỏ qua lần "chạm" lọt ra trong khoảng này (ms). */
const DRAG_SETTLE_MS = 250

/**
 * Tổng thời gian hiệu ứng xoá (thẻ + nút trượt ra, rồi chỗ trống co lại): sau khoảng này `out()` mới xong
 * và màn mới gỡ dòng khỏi danh sách (thêm chút dư để nhịp UI chạy xong trước).
 */
export const SWIPE_DELETE_MS = motion.rowExit + motion.rowFill + 30

/**
 * Dòng đang mở nút xoá (cả app chỉ một): vuốt dòng khác thì dòng này tự đóng. Giữ ref của khung vuốt
 * (định danh ổn định qua các lần render).
 */
let openRow: RefObject<SwipeableMethods | null> | null = null
/** Đang vuốt (hoặc vừa thả tay): chạm thẻ không mở sheet sửa. */
let dragging = false
let dragTimer: ReturnType<typeof setTimeout> | null = null

function startDrag() {
  if (dragTimer) clearTimeout(dragTimer)
  dragTimer = null
  dragging = true
}
function settleDrag() {
  if (!dragging) return
  if (dragTimer) clearTimeout(dragTimer)
  dragTimer = setTimeout(() => {
    dragging = false
    dragTimer = null
  }, DRAG_SETTLE_MS)
}

/** Đóng nút xoá đang mở (nếu có) — vd khi danh sách bắt đầu cuộn. */
export function closeOpenSwipeRow() {
  openRow?.current?.close()
}

/**
 * Bọc `onPress` của thẻ nằm trong `SwipeToDelete` để chạm và vuốt không chồng nhau: đang vuốt / vừa thả
 * tay → bỏ qua; có thẻ đang mở nút xoá → chỉ đóng thẻ đó (kiểu iOS), không mở sheet.
 */
export function guardSwipePress(onPress: () => void) {
  if (dragging) return
  if (openRow?.current) {
    openRow.current.close()
    return
  }
  onPress()
}

type SwipeDeleteA11y = {
  accessibilityActions: { name: 'delete'; label: string }[]
  onAccessibilityAction: (e: AccessibilityActionEvent) => void
}

const SwipeDeleteA11yContext = createContext<SwipeDeleteA11y | null>(null)

/**
 * Thao tác a11y "Xoá" của `SwipeToDelete` bao ngoài, để phần tử a11y của dòng (`LineSummaryRow`) gắn vào:
 * khung bọc không phải phần tử a11y nên trình đọc màn hình không thấy thao tác đặt trên nó. Không nằm
 * trong `SwipeToDelete` / đang khoá → `{}`.
 */
export function useSwipeDeleteA11y(): Partial<SwipeDeleteA11y> {
  return useContext(SwipeDeleteA11yContext) ?? {}
}

export type SwipeToDeleteProps = {
  /**
   * Xoá dòng. Màn tự hỏi lại (nếu cần), rồi `await out()` (chạy hiệu ứng xoá) RỒI MỚI gỡ dòng khỏi dữ
   * liệu. Xong mà thẻ vẫn còn (người dùng huỷ / không xoá được) → thẻ hiện lại, đóng nút xoá.
   */
  onDelete: (out: () => Promise<void>) => void | Promise<unknown>
  /** Nhãn nút xoá (a11y) + nhãn thao tác a11y ("Xoá"). */
  label: string
  /** Khoá (đang ghi lên server): không vuốt được, không có thao tác a11y. */
  enabled: boolean
  /** Khoảng trống dưới thẻ (tới thẻ kế) — nằm TRONG khung để co lại cùng thẻ khi xoá. */
  spacing?: number
  children: ReactNode
  testID?: string
}

/**
 * Vuốt trái để xoá (spec form-wizard §5.2): `ReanimatedSwipeable` của `react-native-gesture-handler`. Dòng
 * là một thẻ riêng (tự bo góc); vuốt trái lộ nút TRÒN đỏ có icon thùng rác nằm trên nền trang, nút phóng
 * to dần theo độ vuốt (nhỏ lại khi vuốt trả), vuốt quá thì thẻ đi chậm lại như dây thun, thả tay thì lò xo
 * hơi nảy. Mở dòng khác → dòng đang mở tự đóng. Thẻ trong khung dùng `guardSwipePress` cho `onPress`.
 *
 * Chạm nút (hoặc thao tác a11y `delete`) → `onDelete(out)`. `out()` chạy hai nhịp do chính khung điều khiển
 * (không dùng layout animation của danh sách — nó tính sai vị trí ô và không kéo theo phần chân danh
 * sách): (1) cả thẻ lẫn nút trượt ra trái hết màn (`motion.rowExit`); (2) XONG mới co chiều cao khung
 * (gồm `spacing`) về 0 (`motion.rowFill`) nên mọi thứ bên dưới, kể cả "⊕ Thêm vật tư", trượt lên liền
 * mạch; hết hai nhịp màn mới gỡ dòng → không có bước nhảy. Nút ẩn với trình đọc màn hình. Reduce Motion:
 * nút không phóng, lò xo tắt, `out()` xong ngay.
 */
export function SwipeToDelete({
  onDelete,
  label,
  enabled,
  spacing = 0,
  children,
  testID,
}: SwipeToDeleteProps) {
  const swipeable = useRef<SwipeableMethods>(null)
  const reduced = useReducedMotion()
  const { width } = useWindowDimensions()
  const mounted = useRef(true)
  const busy = useRef(false)
  // Hiệu ứng xoá: dịch ngang cả khung + chiều cao khung (-1 = tự nhiên, chưa xoá).
  const shiftX = useSharedValue(0)
  const height = useSharedValue(-1)
  const measured = useRef(0)
  // Hàm mới nhất của màn, giữ qua ref để thao tác a11y (memo) không đổi định danh mỗi lần render.
  const deleteRef = useRef(onDelete)
  useEffect(() => {
    deleteRef.current = onDelete
  })
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // Gỡ khỏi "dòng đang mở" khi dòng bị xoá / màn đóng.
      if (openRow === swipeable) openRow = null
    }
  }, [])

  const reducedRef = useRef(reduced)
  const widthRef = useRef(width)
  useEffect(() => {
    reducedRef.current = reduced
    widthRef.current = width
  })

  /** Hai nhịp: trượt ra trái hết màn, rồi co chiều cao về 0. Reduce Motion → xong ngay. */
  const out = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (reducedRef.current) {
          resolve()
          return
        }
        shiftX.set(
          withTiming(-widthRef.current, {
            duration: motion.rowExit,
            easing: Easing.in(Easing.cubic),
          }),
        )
        height.set(measured.current)
        height.set(
          withDelay(
            motion.rowExit,
            withTiming(0, { duration: motion.rowFill, easing: Easing.inOut(Easing.cubic) }),
          ),
        )
        setTimeout(resolve, SWIPE_DELETE_MS)
      }),
    [shiftX, height],
  )

  const requestDelete = useCallback(() => {
    if (busy.current) return
    busy.current = true
    const done = () => {
      busy.current = false
      if (!mounted.current) return
      // Thẻ vẫn còn (huỷ / không xoá được) → hiện lại, đóng nút xoá.
      shiftX.set(0)
      height.set(-1)
      swipeable.current?.close()
    }
    try {
      void Promise.resolve(deleteRef.current(out)).finally(done)
    } catch (e) {
      done()
      throw e
    }
  }, [out, shiftX, height])

  const frameStyle = useAnimatedStyle(() =>
    height.value < 0
      ? { transform: [{ translateX: shiftX.value }] }
      : { height: height.value, overflow: 'hidden', transform: [{ translateX: shiftX.value }] },
  )

  const a11y = useMemo<SwipeDeleteA11y | null>(
    () =>
      enabled
        ? {
            accessibilityActions: [{ name: 'delete', label }],
            onAccessibilityAction: (e) => {
              if (e.nativeEvent.actionName === 'delete') requestDelete()
            },
          }
        : null,
    [enabled, label, requestDelete],
  )

  const renderRightActions = (_progress: SharedValue<number>, translation: SharedValue<number>) => (
    <DeleteAction
      translation={translation}
      reduced={reduced}
      testID={testID ? `${testID}-delete` : undefined}
      onPress={requestDelete}
    />
  )

  return (
    <SwipeDeleteA11yContext value={a11y}>
      <Animated.View
        style={frameStyle}
        onLayout={(e: LayoutChangeEvent) => {
          if (height.get() < 0) measured.current = e.nativeEvent.layout.height
        }}
      >
        <ReanimatedSwipeable
          ref={swipeable}
          testID={testID}
          enabled={enabled}
          friction={1}
          rightThreshold={ACTION_WIDTH / 2}
          overshootRight
          overshootFriction={OVERSHOOT_FRICTION}
          animationOptions={SNAP_SPRING}
          renderRightActions={renderRightActions}
          onSwipeableOpenStartDrag={() => {
            startDrag()
            if (openRow && openRow !== swipeable) openRow.current?.close()
          }}
          onSwipeableCloseStartDrag={startDrag}
          onSwipeableWillOpen={() => {
            settleDrag()
            if (openRow && openRow !== swipeable) openRow.current?.close()
            openRow = swipeable
            haptics.selection()
          }}
          onSwipeableWillClose={() => {
            settleDrag()
            if (openRow === swipeable) openRow = null
          }}
          // Thẻ trượt ra ngoài khung ở mép trái — không cắt để bo góc của thẻ giữ nguyên.
          containerStyle={{ overflow: 'visible' }}
        >
          {children}
        </ReanimatedSwipeable>
        {/* Khoảng cách tới thẻ kế là một View con (KHÔNG dùng padding: Yoga không cho chiều cao khung nhỏ
            hơn padding nên khoảng này không co được, còn lại 10pt rồi nhảy khi dòng bị gỡ). */}
        {spacing > 0 ? <View style={{ height: spacing }} /> : null}
      </Animated.View>
    </SwipeDeleteA11yContext>
  )
}

/** Nút tròn đỏ 44pt: phóng theo quãng vuốt (0,4 → 1 ở đủ vùng nút → 1,15 khi vuốt quá), mờ dần lúc mới vuốt. */
function DeleteAction({
  translation,
  reduced,
  onPress,
  testID,
}: {
  translation: SharedValue<number>
  reduced: boolean
  onPress: () => void
  testID?: string
}) {
  const { colors } = useTheme()
  const style = useAnimatedStyle(() => {
    const pulled = -translation.value
    return {
      opacity: interpolate(pulled, [8, 40], [0, 1], Extrapolation.CLAMP),
      transform: [
        {
          scale: reduced
            ? 1
            : interpolate(
                pulled,
                [0, 16, ACTION_WIDTH, ACTION_WIDTH + 80],
                [0.4, 0.4, 1, 1.15],
                Extrapolation.CLAMP,
              ),
        },
      ],
    }
  })
  return (
    <View style={{ width: ACTION_WIDTH, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={style}>
        <Pressable
          testID={testID}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          onPress={onPress}
          style={({ pressed }) => ({
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            borderRadius: BUTTON_SIZE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.destructive,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          {/* Icon trắng ở cả hai chế độ sáng / tối. */}
          <Trash2 size={20} strokeWidth={2.25} color={colors.accentForeground} aria-hidden />
        </Pressable>
      </Animated.View>
    </View>
  )
}
