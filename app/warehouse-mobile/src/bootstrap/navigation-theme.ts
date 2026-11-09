import { DarkTheme, DefaultTheme, type Theme as NavigationTheme } from 'expo-router'

import { fontStyle } from '@/shared/theme/fonts'
import { darkColors, lightColors } from '@/shared/theme/tokens'

/** Màu nền/viền của navigator theo token app — không thì chuyển màn chớp nền trắng ở chế độ tối. */
export function navigationThemeFor(scheme: 'light' | 'dark'): NavigationTheme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme
  const colors = scheme === 'dark' ? darkColors : lightColors
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.background,
      text: colors.foreground,
      border: colors.border,
      notification: colors.destructive,
    },
    fonts: {
      // Font hệ thống: không fontFamily, chỉ fontWeight.
      regular: {
        fontFamily: 'System',
        ...fontStyle('regular'),
      } as NavigationTheme['fonts']['regular'],
      medium: {
        fontFamily: 'System',
        ...fontStyle('medium'),
      } as NavigationTheme['fonts']['medium'],
      bold: { fontFamily: 'System', ...fontStyle('semibold') } as NavigationTheme['fonts']['bold'],
      heavy: { fontFamily: 'System', ...fontStyle('bold') } as NavigationTheme['fonts']['heavy'],
    },
  }
}
