import { SymbolView } from 'expo-symbols'
import { Plus } from './icons'
import { Platform, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { canUseLiquidGlass } from '../lib/liquid-glass'
import { useTheme } from '../theme/useTheme'
import { GlassCircleButton } from './GlassCircleButton'

/** Đường kính nút (pt); danh sách cần chừa `FLOATING_BUTTON_SPACE` ở đáy. */
export const FLOATING_BUTTON_SIZE = 52
/**
 * Lề phải: iOS 26+ thanh tab là viên kính nổi thụt ~20pt mỗi bên (đo trên iPhone 12 iOS 26) → nút thẳng
 * mép phải viên tab; không kính (iOS < 26 tab tràn ngang, Android) → 16pt = lề nội dung danh sách.
 */
const RIGHT_GAP_GLASS = 20
const RIGHT_GAP = 16
/** Khoảng hở giữa nút và mép trên thanh tab. */
const ABOVE_TAB_BAR_GAP = 12
/** Chỗ cần chừa dưới cùng của danh sách để dòng cuối không bị nút che (cùng nguồn với vị trí nút). */
export const FLOATING_BUTTON_SPACE = FLOATING_BUTTON_SIZE + ABOVE_TAB_BAR_GAP + 16

export type FloatingCreateButtonProps = {
  /** Đã dịch sẵn, vd "Tạo phiếu nhập". */
  label: string
  onPress: () => void
}

/**
 * Nút "+" tròn nổi, góc dưới phải, ngay trên thanh tab. iOS 26+: Liquid Glass tương tác tô xanh dương
 * (`GlassCircleButton` — điều kiện có kính và phản hồi nhấn nằm ở đó); không thì hình tròn đặc + bóng.
 *
 * Vị trí: iOS bọc trong `SafeAreaView edges=['bottom']` — inset là của CHÍNH view này (native tính theo
 * khung của nó) nên đã gồm chiều cao thanh tab (NativeTabs để nội dung trải dưới thanh, cũng là lý do
 * ScrollView dùng `contentInsetAdjustmentBehavior="automatic"`). Android: NativeTabs đã chừa đáy cho
 * nội dung (thanh tab + thanh điều hướng hệ thống) và KHÔNG có SafeAreaProvider riêng, nên
 * SafeAreaView sẽ đọc inset của provider gốc và đệm lần hai → dùng View thường. Đặt trong khung màn
 * của tab (cha `flex: 1`), sau danh sách; danh sách chừa `FLOATING_BUTTON_SPACE` ở đáy.
 */
export function FloatingCreateButton({ label, onPress }: FloatingCreateButtonProps) {
  const { colors } = useTheme()
  const icon =
    Platform.OS === 'ios' ? (
      <SymbolView name="plus" size={24} weight="semibold" tintColor={colors.accentForeground} />
    ) : (
      <Plus size={24} color={colors.accentForeground} aria-hidden />
    )
  const Container = Platform.OS === 'ios' ? SafeAreaView : View
  const containerProps = Platform.OS === 'ios' ? { edges: ['bottom' as const] } : null
  return (
    <Container
      testID="fab-container"
      {...containerProps}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'flex-end',
        paddingRight: canUseLiquidGlass() ? RIGHT_GAP_GLASS : RIGHT_GAP,
        paddingBottom: ABOVE_TAB_BAR_GAP,
      }}
    >
      {/* Kính tô xanh dương hệ thống (vẫn là Liquid Glass); dự phòng: hình tròn xanh đặc. */}
      <GlassCircleButton
        label={label}
        onPress={onPress}
        size={FLOATING_BUTTON_SIZE}
        icon={icon}
        glassTint={colors.accent}
        fallbackColor={colors.accent}
        fallbackTestID="fab-fallback"
      />
    </Container>
  )
}
