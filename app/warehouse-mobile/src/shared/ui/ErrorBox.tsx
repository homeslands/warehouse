import { View, type StyleProp, type ViewStyle } from 'react-native'

import { useTheme } from '@/shared/theme/useTheme'

import { CircleAlert } from './icons'
import { Text } from './Text'

type Props = { style?: StyleProp<ViewStyle> } & (
  { message: string; lines?: undefined } | { lines: string[]; message?: undefined }
)

/** Hộp lỗi viền đỏ (role `alert`): một câu (`message`) hoặc nhiều dòng (`lines`). */
export function ErrorBox({ message, lines, style }: Props) {
  const { colors, radius } = useTheme()
  return (
    <View
      accessible
      accessibilityRole="alert"
      style={[
        {
          flexDirection: 'row',
          gap: 8,
          padding: 12,
          borderRadius: radius.group,
          borderWidth: 1,
          borderColor: colors.destructive,
        },
        style,
      ]}
    >
      <CircleAlert size={16} color={colors.destructive} style={{ marginTop: 2 }} />
      {lines ? (
        <View style={{ flex: 1, gap: 4 }}>
          {lines.map((line, i) => (
            <Text key={i} size={14} style={{ color: colors.destructive }}>
              {line}
            </Text>
          ))}
        </View>
      ) : (
        <Text size={14} style={{ flex: 1, color: colors.destructive }}>
          {message}
        </Text>
      )}
    </View>
  )
}
