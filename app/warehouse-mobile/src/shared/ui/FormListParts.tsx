import { StyleSheet, View } from 'react-native'

import { useTheme } from '@/shared/theme/useTheme'

import { LIST_GUTTER } from './card'

const SKELETON_ROWS = 5

/**
 * Khung xương của danh sách (Nhập / Xuất / Tồn kho): `rows` dòng (mặc định 5) cùng khuôn `PlainListRow`
 * — phẳng trên nền `background`, ba thanh chữ trái + một thanh phải, đường kẻ hairline giữa các dòng
 * (thụt lề chữ 16). Lề ngang 16 do `contentContainerStyle` của danh sách đặt.
 */
export function FormListSkeleton({
  label,
  rowTestID,
  rows = SKELETON_ROWS,
}: {
  label: string
  rowTestID: string
  rows?: number
}) {
  const { colors } = useTheme()
  const bar = (width: number | `${number}%`, height: number) => ({
    width,
    height,
    borderRadius: 4,
    backgroundColor: colors.fill,
  })
  return (
    <View accessible accessibilityLabel={label} style={{ paddingTop: 8 }}>
      {Array.from({ length: rows }, (_, n) => (
        <View key={n}>
          {n > 0 ? (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                marginRight: -LIST_GUTTER,
                backgroundColor: colors.listSeparator,
              }}
            />
          ) : null}
          <View
            testID={rowTestID}
            style={{ flexDirection: 'row', gap: 12, minHeight: 60, paddingVertical: 12 }}
          >
            <View style={{ flex: 1, gap: 9 }}>
              <View style={bar(`${64 - (n % 3) * 10}%`, 14)} />
              <View style={bar('45%', 11)} />
              <View style={bar('30%', 11)} />
            </View>
            <View style={{ gap: 9, alignItems: 'flex-end' }}>
              <View style={bar(72, 14)} />
              <View style={bar(48, 11)} />
            </View>
          </View>
        </View>
      ))}
    </View>
  )
}
