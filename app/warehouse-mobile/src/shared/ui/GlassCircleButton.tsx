import { GlassView } from 'expo-glass-effect'
import type { ReactNode } from 'react'
import { Pressable, View, type ColorValue } from 'react-native'

import { canUseLiquidGlass } from '../lib/liquid-glass'

export { canUseLiquidGlass }

export type GlassCircleButtonProps = {
  /** Đã dịch sẵn — nhãn cho trình đọc màn hình. */
  label: string
  onPress: () => void
  /** Đường kính (pt). */
  size: number
  /** Icon đã tô màu sẵn (nơi gọi tự đổi màu khi `disabled`). */
  icon: ReactNode
  /** Tô màu kính (`GlassView tintColor`); bỏ trống = kính trong, không tô. */
  glassTint?: ColorValue
  /** Nền hình tròn dự phòng (không có kính) — luôn đặc, kèm bóng nhẹ. */
  fallbackColor: ColorValue
  disabled?: boolean
  /** testID của hình tròn dự phòng (mặc định `glass-circle-fallback`). */
  fallbackTestID?: string
}

/**
 * Nút tròn Liquid Glass tương tác (`GlassView isInteractive`), dự phòng là hình tròn đặc + bóng nhẹ.
 * Dùng chung cho nút nổi tạo phiếu (`FloatingCreateButton`) và nút "+" ở đáy màn phiếu nhập.
 *
 * KHÔNG đặt opacity/scale lên GlassView hay cha của nó (alpha < 1 làm mất hiệu ứng kính); phản hồi
 * nhấn của kính do `isInteractive` lo. Chỉ nhánh dự phòng mới mờ/thu nhỏ khi nhấn.
 */
export function GlassCircleButton({
  label,
  onPress,
  size,
  icon,
  glassTint,
  fallbackColor,
  disabled = false,
  fallbackTestID = 'glass-circle-fallback',
}: GlassCircleButtonProps) {
  const glass = canUseLiquidGlass()
  const circle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={
        glass
          ? undefined
          : ({ pressed }) => ({
              transform: [{ scale: pressed ? 0.94 : 1 }],
              opacity: pressed ? 0.85 : 1,
            })
      }
    >
      {glass ? (
        <GlassView
          isInteractive
          glassEffectStyle="regular"
          {...(glassTint ? { tintColor: glassTint } : null)}
          style={circle}
        >
          {icon}
        </GlassView>
      ) : (
        <View
          testID={fallbackTestID}
          style={[
            circle,
            {
              backgroundColor: fallbackColor,
              shadowColor: '#000',
              shadowOpacity: 0.16,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            },
          ]}
        >
          {icon}
        </View>
      )}
    </Pressable>
  )
}
