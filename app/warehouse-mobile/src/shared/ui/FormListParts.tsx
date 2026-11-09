import { StyleSheet, View } from 'react-native'

import { useTheme } from '@/shared/theme/useTheme'

const SKELETON_ROWS = 5

/** Khung xương của danh sách phiếu: 5 dòng cùng nhịp với dòng thật (ô trạng thái 34 + hai dòng chữ + cột phải). */
export function FormListSkeleton({ label, rowTestID }: { label: string; rowTestID: string }) {
  const { colors, radius } = useTheme()
  const bar = (width: number | `${number}%`, height: number) => ({
    width,
    height,
    borderRadius: 4,
    backgroundColor: colors.fill,
  })
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{ backgroundColor: colors.card, borderRadius: radius.groupLarge, overflow: 'hidden' }}
    >
      {Array.from({ length: SKELETON_ROWS }, (_, n) => (
        <View
          key={n}
          testID={rowTestID}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            minHeight: 64,
            paddingHorizontal: 16,
            borderTopWidth: n > 0 ? StyleSheet.hairlineWidth : 0,
            borderTopColor: colors.separator,
          }}
        >
          <View style={{ ...bar(34, 34), borderRadius: 10 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={bar(`${64 - (n % 3) * 10}%`, 12)} />
            <View style={bar('45%', 10)} />
          </View>
          <View style={bar(64, 12)} />
        </View>
      ))}
    </View>
  )
}

/** Đường kẻ giữa hai dòng: nền thẻ, kẻ lùi qua ô trạng thái. */
export function FormRowSeparator({ inset }: { inset: number }) {
  const { colors } = useTheme()
  return (
    <View style={{ backgroundColor: colors.card }}>
      <View
        style={{
          height: StyleSheet.hairlineWidth,
          marginLeft: inset,
          backgroundColor: colors.separator,
        }}
      />
    </View>
  )
}
