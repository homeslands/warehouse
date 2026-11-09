import { Platform, type TextStyle } from 'react-native'

export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold'

const WEIGHTS = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const satisfies Record<FontWeight, TextStyle['fontWeight']>

/** Font hệ thống (iOS SF Pro, Android Roboto): không đặt fontFamily, chỉ fontWeight. */
export function fontStyle(weight: FontWeight = 'regular'): TextStyle {
  return { fontWeight: WEIGHTS[weight] }
}

/** Số (tiền, số lượng, đếm): font hệ thống + chữ số bằng nhau để cột thẳng hàng. */
export function numericStyle(weight: FontWeight = 'regular'): TextStyle {
  return { ...fontStyle(weight), fontVariant: ['tabular-nums'] }
}

/** Mã định danh: font đơn cách của hệ thống (iOS SF Mono qua `ui-monospace`, Android `monospace`). */
export function codeStyle(weight: FontWeight = 'regular'): TextStyle {
  return {
    fontFamily: Platform.OS === 'ios' ? 'ui-monospace' : 'monospace',
    ...fontStyle(weight),
  }
}
