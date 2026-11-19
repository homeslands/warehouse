import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { useTheme } from '../../theme/useTheme'
import type { LucideIcon } from '../icons'
import { ROW_PRESS_DELAY_MS } from '../press'
import { Text } from '../Text'

/** Lề ngang của danh sách (`contentContainerStyle.paddingHorizontal`) — dòng bù lại để tràn ngang. */
export const LIST_GUTTER = 16
/** Ô icon đầu dòng 44, bo 12. */
const TILE = 44
const GAP = 14

export type PlainListRowProps = {
  /**
   * Ô icon đầu dòng tuỳ chọn — TRUNG TÍNH cố định (nền `fill`, icon `fillForeground`, chốt 2026-11-19): hình
   * icon nói LOẠI, màu chỉ dành cho trạng thái — nơi gọi không truyền màu được.
   */
  tile?: { icon: LucideIcon; testID?: string }
  /** Các hàng `RowLine`. */
  children: ReactNode
  /** Dòng đầu nhóm: không vẽ đường kẻ phía trên. */
  first: boolean
  testID?: string
  accessibilityLabel?: string
  onPress?: () => void
}

/**
 * Một dòng danh sách PHẲNG kiểu danh sách giao dịch (Zalopay) / Mail: nền `background`, tràn ngang (bù
 * `LIST_GUTTER` của danh sách), không thẻ, không `›`; giữa các dòng cùng nhóm là đường kẻ hairline thụt tới
 * chỗ chữ, chạy tới mép phải. Nội dung dựng bằng các hàng `RowLine` để cột phải thẳng theo từng hàng.
 * Danh sách KHÔNG đặt `ItemSeparatorComponent`.
 */
export function PlainListRow({
  tile,
  children,
  first,
  testID,
  accessibilityLabel,
  onPress,
}: PlainListRowProps) {
  const { colors } = useTheme()
  const Icon = tile?.icon
  const body = (
    <>
      {tile && Icon ? (
        <View
          testID={tile.testID}
          style={{
            width: TILE,
            height: TILE,
            borderRadius: 12,
            borderCurve: 'continuous',
            backgroundColor: colors.fill,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={21} color={colors.fillForeground} strokeWidth={1.9} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>{children}</View>
    </>
  )
  const row = {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: GAP,
    paddingHorizontal: LIST_GUTTER,
    paddingVertical: 14,
    minHeight: 60,
  } as const
  return (
    <View style={{ marginHorizontal: -LIST_GUTTER }}>
      {first ? null : (
        <View
          testID="row-separator"
          style={{
            height: StyleSheet.hairlineWidth,
            marginLeft: LIST_GUTTER + (tile ? TILE + GAP : 0),
            backgroundColor: colors.listSeparator,
          }}
        />
      )}
      {onPress ? (
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          unstable_pressDelay={ROW_PRESS_DELAY_MS}
          style={({ pressed }) => [
            row,
            { backgroundColor: pressed ? colors.rowPressed : colors.background },
          ]}
        >
          {body}
        </Pressable>
      ) : (
        <View
          testID={testID}
          accessible={accessibilityLabel !== undefined}
          accessibilityLabel={accessibilityLabel}
          style={row}
        >
          {body}
        </View>
      )}
    </View>
  )
}

/** Một hàng của `PlainListRow`: [trái co giãn, một dòng][phải giữ cỡ, căn phải]. */
export function RowLine({
  children,
  end,
  endTestID,
}: {
  children?: ReactNode
  end?: ReactNode
  endTestID?: string
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: GAP }}>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      {end ? (
        <View testID={endTestID} style={{ flexShrink: 0, maxWidth: '55%', alignItems: 'flex-end' }}>
          {end}
        </View>
      ) : null}
    </View>
  )
}

/**
 * Trạng thái ở cột phải: CHỈ chữ — 13 medium nghiêng, màu tươi (`status*`, đủ AA). Là điểm màu duy nhất của
 * dòng (ô icon trung tính). Chốt 2026-11-19 sau chấm + chữ → nhãn nền nhạt → nhãn nền đặc.
 */
export function RowStatus({
  label,
  color,
  testID,
}: {
  label: string
  color: string
  testID?: string
}) {
  return (
    <Text
      testID={testID}
      weight="medium"
      size={13}
      numberOfLines={1}
      style={{ color, fontStyle: 'italic' }}
    >
      {label}
    </Text>
  )
}

/**
 * Tiêu đề nhóm của danh sách phẳng kiểu lịch sử giao dịch (nhóm theo THÁNG nên ít tiêu đề): chữ 20 đậm
 * (`header`) + dòng phụ 13 xám bên dưới (vd "6 phiếu"). Không kẻ. Lề ngang do danh sách đặt; đệm trên do
 * màn đặt (nhóm đầu ít hơn).
 */
export function ListSectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ paddingBottom: 2, gap: 2 }}>
      <Text accessibilityRole="header" weight="bold" size={20} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text muted size={13} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  )
}
