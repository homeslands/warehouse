import { Text as RNText, type TextProps as RNTextProps } from 'react-native'

import { useTheme } from '../theme/useTheme'
import { codeStyle, fontStyle, numericStyle, type FontWeight } from '../theme/fonts'

export type TextProps = RNTextProps & {
  weight?: FontWeight
  /** Số (tiền, số lượng, đếm): chữ số bằng nhau (tabular-nums). */
  numeric?: boolean
  /** Mã định danh (mã phiếu, vật tư, kho…): font đơn cách của hệ thống. */
  code?: boolean
  muted?: boolean
  size?: number
}

export function Text({
  weight = 'regular',
  numeric,
  code,
  muted,
  size = 15,
  style,
  ...rest
}: TextProps) {
  const { colors } = useTheme()
  const font = code ? codeStyle(weight) : numeric ? numericStyle(weight) : fontStyle(weight)
  return (
    <RNText
      style={[
        font,
        { fontSize: size, color: muted ? colors.mutedForeground : colors.foreground },
        style,
      ]}
      {...rest}
    />
  )
}
