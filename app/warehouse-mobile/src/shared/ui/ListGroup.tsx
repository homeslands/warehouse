import { Children, Fragment, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import { useTheme } from '../theme/useTheme'

export type ListGroupProps = {
  children: ReactNode
  /**
   * Đường kẻ bắt đầu cách mép trái bao nhiêu. Mặc định 53 = sau ô icon (14 lề + 28 ô + 11 khoảng
   * cách) như iOS; nhóm không có icon thì truyền 14.
   */
  inset?: number
  /** Bo góc lớn 26 kiểu iOS 26/27 (màn Tài khoản). */
  large?: boolean
}

/** Thẻ trắng bo góc chứa các `ListRow`, kẻ mảnh giữa các dòng. Con `null`/`false` bị bỏ qua. */
export function ListGroup({ children, inset = 53, large }: ListGroupProps) {
  const { colors, radius } = useTheme()
  const rows = Children.toArray(children)
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: large ? radius.groupLarge : radius.group,
        overflow: 'hidden',
      }}
    >
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <View
              testID="list-separator"
              style={{
                height: StyleSheet.hairlineWidth,
                marginLeft: inset,
                backgroundColor: colors.separator,
              }}
            />
          ) : null}
          {row}
        </Fragment>
      ))}
    </View>
  )
}
