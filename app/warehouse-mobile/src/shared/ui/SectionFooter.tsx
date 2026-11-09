import type { TextProps } from 'react-native'

import { useTheme } from '../theme/useTheme'
import { Text } from './Text'

export type SectionFooterProps = Pick<TextProps, 'accessibilityRole'> & {
  children: string
  /** Chữ có số (tỉ lệ, số lượng) → chữ số bằng nhau. */
  numeric?: boolean
  /** `success` cho thông báo xong việc. */
  tone?: 'default' | 'success'
}

/** Chú thích nhỏ dưới một `ListGroup`. */
export function SectionFooter({
  children,
  tone = 'default',
  numeric,
  ...rest
}: SectionFooterProps) {
  const { colors } = useTheme()
  const color = {
    default: colors.groupedLabel,
    success: colors.success,
  }[tone]
  return (
    <Text
      numeric={numeric}
      size={12}
      style={{ color, lineHeight: 17, paddingHorizontal: 16, paddingTop: 6 }}
      {...rest}
    >
      {children}
    </Text>
  )
}
