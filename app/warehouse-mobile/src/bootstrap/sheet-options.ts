import type { NativeStackNavigationOptions } from 'expo-router'
import { Platform } from 'react-native'

import { canUseLiquidGlass } from '@/shared/lib/liquid-glass'
import type { ColorTokens } from '@/shared/theme/tokens'

/**
 * Cách trình bày chung của MỌI sheet (route) trong `SessionGate`. iOS 26/27: formSheet + thanh kéo; hệ
 * thống vẽ nền kính, app phủ thêm `sheetTint` bán trong suốt cho đục hơn kính trần (chữ, thẻ dễ đọc
 * hơn). iOS < 26: không có kính → nền ĐẶC `sheetSolid` (sheet mặc định). Android: modal nền thẻ (formSheet Android không chứa được Stack lồng của header).
 */
/** Nền thân sheet: iOS 26+ phủ `sheetTint` lên kính; iOS < 26 đặc `sheetSolid`; Android nền thẻ. */
function sheetBackground(colors: ColorTokens): string {
  if (Platform.OS !== 'ios') return colors.card
  return canUseLiquidGlass() ? colors.sheetTint : colors.sheetSolid
}

export function sheetScreenOptions(
  detents: number[],
  colors: ColorTokens,
): NativeStackNavigationOptions {
  return {
    presentation: Platform.OS === 'ios' ? 'formSheet' : 'modal',
    sheetAllowedDetents: detents,
    sheetInitialDetentIndex: 0,
    sheetGrabberVisible: true,
    contentStyle: { backgroundColor: sheetBackground(colors) },
  }
}
