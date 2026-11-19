import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useTheme } from '../../theme/useTheme'
import { Text } from '../Text'

/** Tiêu đề nhóm (22 đậm) + chữ phụ bên phải (kỳ đang lọc). */
export function GroupTitle({ title, right }: { title: string; right?: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
        paddingHorizontal: 4,
      }}
    >
      <Text accessibilityRole="header" weight="bold" size={22} style={{ flex: 1 }}>
        {title}
      </Text>
      {right ? (
        <Text muted size={15} numberOfLines={1} style={{ flexShrink: 1 }}>
          {right}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * Số to + đơn vị nhỏ muted liền sau (cùng dòng chữ, thẳng chân chữ): "3,1" + " tr đ". Nối hai phần đúng
 * bằng chuỗi gốc (đơn vị tự mang dấu cách nếu cần).
 */
export function BigValue({
  value,
  unit,
  size = 32,
  color,
  dim,
  testID,
}: {
  value: string
  unit?: string
  size?: number
  color?: string
  dim?: boolean
  testID?: string
}) {
  const { colors } = useTheme()
  return (
    <Text
      numeric
      weight="bold"
      size={size}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      testID={testID}
      style={{ color: color ?? colors.foreground, opacity: dim ? 0.45 : 1 }}
    >
      {value}
      {unit ? (
        <Text weight="semibold" size={15} style={{ color: colors.mutedForeground }}>
          {unit}
        </Text>
      ) : null}
    </Text>
  )
}

export type ValueState = 'loading' | 'failed' | 'truncated' | 'ok'

/**
 * Một số theo trạng thái (luật chung của Tổng quan): đang tải → khung xám `<id>-loading`; lỗi → "!"
 * `<id>-error`; vượt trần → "–" + "quá nhiều phiếu để tính" (không bao giờ hiện số thiếu như đủ); có số →
 * `BigValue` `<id>-value`.
 */
export function StateValue({
  id,
  state,
  value,
  unit,
  size = 32,
  color,
  dim,
}: {
  id: string
  state: ValueState
  value?: string
  unit?: string
  size?: number
  color?: string
  dim?: boolean
}) {
  const { t } = useTranslation('overview')
  const { colors } = useTheme()
  if (state === 'loading')
    return (
      <View
        testID={`${id}-loading`}
        style={{
          height: Math.round(size * 0.9),
          width: '55%',
          marginVertical: Math.round(size * 0.1),
          borderRadius: 6,
          backgroundColor: colors.fill,
        }}
      />
    )
  if (state === 'failed')
    return (
      <Text
        numeric
        weight="bold"
        size={size}
        testID={`${id}-error`}
        style={{ color: colors.destructiveText }}
      >
        !
      </Text>
    )
  if (state === 'truncated')
    return (
      <View style={{ gap: 2 }}>
        <Text numeric weight="bold" size={size} muted testID={`${id}-value`}>
          –
        </Text>
        <Text muted size={12}>
          {t('money.truncated')}
        </Text>
      </View>
    )
  return (
    <BigValue
      testID={`${id}-value`}
      value={value ?? ''}
      unit={unit}
      size={size}
      color={color}
      dim={dim}
    />
  )
}
