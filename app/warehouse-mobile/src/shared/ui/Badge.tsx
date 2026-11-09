import { View } from 'react-native'

import { useTheme } from '../theme/useTheme'
import { Text } from './Text'

export type BadgeVariant = 'neutral' | 'solid' | 'outline'

export type BadgeProps = {
  children: string
  /** `neutral` = nền xám (mặc định), `solid` = nền đen, `outline` = viền, chữ hoa (nhãn môi trường). */
  variant?: BadgeVariant
  /** Bo tròn hẳn hai đầu (viên thuốc) thay vì bo góc nhỏ. */
  pill?: boolean
  testID?: string
}

/** Nhãn nhỏ: vai trò ("Quản lý"), môi trường ("SANDBOX"). */
export function Badge({ children, variant = 'neutral', pill, testID }: BadgeProps) {
  const { colors } = useTheme()
  const outline = variant === 'outline'
  const { bg, fg } = {
    neutral: { bg: colors.fill, fg: colors.fillForeground },
    solid: { bg: colors.primary, fg: colors.primaryForeground },
    outline: { bg: 'transparent', fg: colors.fillForeground },
  }[variant]
  return (
    <View
      testID={testID}
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: outline ? 7 : 6,
        paddingVertical: outline ? 2 : 1,
        borderRadius: pill ? 999 : outline ? 6 : 5,
        backgroundColor: bg,
        borderWidth: outline ? 1 : 0,
        borderColor: colors.border,
      }}
    >
      <Text
        weight={outline ? 'bold' : 'semibold'}
        size={outline ? 10.5 : 11}
        numberOfLines={1}
        style={{
          color: fg,
          letterSpacing: outline ? 0.6 : 0,
          textTransform: outline ? 'uppercase' : 'none',
        }}
      >
        {children}
      </Text>
    </View>
  )
}
