import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect'
import { Platform } from 'react-native'

/**
 * Có vẽ Liquid Glass được không: chỉ iOS 26+ khi CẢ `isLiquidGlassAvailable()` và
 * `isGlassEffectAPIAvailable()` (một số bản iOS 26 crash khi thiếu cái sau — expo#40911).
 * `expo-glass-effect` có sẵn trong Expo Go SDK 58. Cũng là điều kiện "sheet có nền kính hệ thống":
 * iOS < 26 không có kính nên sheet phải đục (xem `bootstrap/sheet-options.ts`).
 */
export function canUseLiquidGlass(): boolean {
  return Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()
}
