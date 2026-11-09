import type { LucideIcon } from 'lucide-react-native'
import { View } from 'react-native'

import { useTheme } from '../theme/useTheme'
import { Text } from './Text'

export type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  /** Viên nhỏ dưới mô tả, vd "Sắp có". */
  badge?: string
}

/** Màn trống: icon lớn trong ô viền bo góc, tiêu đề, mô tả, viên trạng thái. */
export function EmptyState({ icon: Icon, title, description, badge }: EmptyStateProps) {
  const { colors } = useTheme()
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 34 }}>
      <View
        testID="empty-state-icon"
        aria-hidden
        style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          marginBottom: 16,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 20px -12px rgba(0,0,0,0.25)',
        }}
      >
        <Icon size={30} color={colors.foreground} strokeWidth={1.6} />
      </View>
      <Text weight="semibold" size={17} style={{ textAlign: 'center' }}>
        {title}
      </Text>
      <Text muted size={14} style={{ textAlign: 'center', lineHeight: 21, marginTop: 6 }}>
        {description}
      </Text>
      {badge ? (
        <View
          style={{
            marginTop: 14,
            paddingHorizontal: 9,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: colors.fill,
          }}
        >
          <Text
            weight="bold"
            size={11}
            style={{
              color: colors.fillForeground,
              letterSpacing: 0.66,
              textTransform: 'uppercase',
            }}
          >
            {badge}
          </Text>
        </View>
      ) : null}
    </View>
  )
}
