import { useColorScheme } from 'react-native'

import { useAppearance } from './appearance'
import { darkColors, lightColors, radius, type ColorTokens } from './tokens'

export type Theme = {
  colors: ColorTokens
  scheme: 'light' | 'dark'
  radius: typeof radius
}

/**
 * Bảng màu theo lựa chọn "Giao diện" (Tài khoản → Cài đặt); "Theo hệ thống" thì theo máy. Lựa chọn
 * Sáng / Tối được đọc thẳng từ store để màu JS đổi ngay, không chờ sự kiện native của `Appearance`.
 */
export function useTheme(): Theme {
  const system = useColorScheme()
  const preference = useAppearance((s) => s.preference)
  const scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference
  return { colors: scheme === 'dark' ? darkColors : lightColors, scheme, radius }
}
