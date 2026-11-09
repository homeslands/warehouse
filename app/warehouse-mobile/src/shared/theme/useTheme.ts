import { useColorScheme } from 'react-native'

import { darkColors, lightColors, radius, type ColorTokens } from './tokens'

export type Theme = {
  colors: ColorTokens
  scheme: 'light' | 'dark'
  radius: typeof radius
}

export function useTheme(): Theme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light'
  return { colors: scheme === 'dark' ? darkColors : lightColors, scheme, radius }
}
