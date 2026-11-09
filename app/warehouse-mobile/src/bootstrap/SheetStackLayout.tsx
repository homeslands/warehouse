import { Stack } from 'expo-router'
import { Platform } from 'react-native'

import { canUseLiquidGlass } from '@/shared/lib/liquid-glass'
import { fontStyle } from '@/shared/theme/fonts'
import { useTheme } from '@/shared/theme/useTheme'

/**
 * Stack lồng của MỘT sheet route (`app/<sheet>/_layout.tsx`): cho sheet một header NATIVE (tiêu đề giữa,
 * ✕ trái, ✓ phải — màn khai qua `SheetScaffold`/`sheetHeaderOptions`). Docs SDK 58 không đảm bảo
 * header native trực tiếp trong `formSheet`; Stack lồng là cách UIKit chuẩn (UINavigationController
 * trong sheet). Android trình bày sheet bằng `modal` (formSheet Android không hỗ trợ Stack lồng).
 * iOS 26/27: KHÔNG đặt nền header/nội dung để hệ thống vẽ nền kính của sheet; iOS < 26: nền đặc
 * `sheetSolid`; Android: nền thẻ.
 */
export function SheetStackLayout() {
  const { colors } = useTheme()
  const ios = Platform.OS === 'ios'
  // iOS < 26 không có nền kính: header + nội dung đặc `sheetSolid` (khớp `sheetScreenOptions`).
  const glass = ios && canUseLiquidGlass()
  const solid = ios && !glass
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerTintColor: colors.foreground,
        headerTitleStyle: { ...fontStyle('semibold'), color: colors.foreground },
        ...(glass
          ? null
          : { headerStyle: { backgroundColor: solid ? colors.sheetSolid : colors.card } }),
        contentStyle: {
          backgroundColor: glass ? 'transparent' : solid ? colors.sheetSolid : colors.card,
        },
      }}
    />
  )
}
