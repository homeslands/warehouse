import { User } from './icons'
import { View } from 'react-native'

import { useTheme } from '../theme/useTheme'
import { Text } from './Text'

/** Chữ cái đầu của từ đầu và từ cuối ("Nguyễn Văn A" → "NA"); một từ → một chữ; rỗng → "". */
export function initialsOf(name: string | undefined | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const first = words[0]!.charAt(0)
  const last = words.length > 1 ? words[words.length - 1]!.charAt(0) : ''
  return (first + last).toLocaleUpperCase('vi')
}

export type AvatarProps = {
  /** Họ tên đầy đủ. Rỗng → icon người. */
  name?: string | null
  size?: number
}

/** Ảnh đại diện tròn: chữ cái đầu của họ tên, chưa có tên thì icon người. Chỉ để trang trí. */
export function Avatar({ name, size = 52 }: AvatarProps) {
  const { colors } = useTheme()
  const initials = initialsOf(name)
  return (
    <View
      testID="avatar"
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        // Gradient tối dịu (đen trên nền sáng, xám trung tính trên nền đen); máy không vẽ được
        // gradient thì vẫn có màu nền đặc.
        backgroundColor: colors.avatarFallback,
        backgroundImage: colors.avatarGradient,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {initials ? (
        <Text
          weight="semibold"
          size={Math.round(size * 0.35)}
          style={{ color: colors.avatarForeground }}
        >
          {initials}
        </Text>
      ) : (
        <User testID="avatar-icon" size={Math.round(size * 0.42)} color={colors.avatarForeground} />
      )}
    </View>
  )
}
