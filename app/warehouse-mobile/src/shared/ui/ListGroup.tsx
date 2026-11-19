import { Children, Fragment, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import { useTheme } from '../theme/useTheme'
import { ListVariantContext } from './cardVariant'

export type ListGroupProps = {
  children: ReactNode
  /**
   * Đường kẻ bắt đầu cách mép trái bao nhiêu. Mặc định 53 = sau ô icon (14 lề + 28 ô + 11 khoảng
   * cách) như iOS; nhóm không có icon thì truyền 14.
   */
  inset?: number
  /** Bo góc lớn 26 kiểu iOS 26/27 (màn Tài khoản). */
  large?: boolean
  /**
   * `card`: kiểu card Tổng quan — bo 24, lề trong 20, icon trong vòng 40pt nền `fill`, đường kẻ thụt
   * theo vòng icon (72; truyền `inset` để đổi cho nhóm không có icon). Mặc định giữ nguyên giao diện cũ.
   */
  /**
   * `iconCard`: như `card`, nhưng lề quanh vòng icon cân đều 12 (trái = trên = dưới, dòng cao 64), đường kẻ
   * thụt 64 — nhóm mà dòng nào cũng có icon.
   */
  variant?: 'default' | 'card' | 'iconCard'
}

/** Lề trong của dòng variant card (`ListRow`): vòng icon / chữ bắt đầu cách mép thẻ 20. */
export const CARD_CONTENT_INSET = 20
/** Đường kẻ của variant card: lề 20 + vòng icon 40 + khoảng cách icon–chữ 12. */
export const CARD_SEPARATOR_INSET = 72
/** Variant `iconCard`: lề quanh vòng icon 40 — trái = trên = dưới = 12 (dòng cao 64). */
export const ICON_CARD_INSET = 12
/** Đường kẻ của variant `iconCard`: lề 12 + vòng icon 40 + khoảng cách icon–chữ 12. */
export const ICON_CARD_SEPARATOR_INSET = 64

/** Thẻ trắng bo góc chứa các `ListRow`, kẻ mảnh giữa các dòng. Con `null`/`false` bị bỏ qua. */
export function ListGroup({ children, inset, large, variant = 'default' }: ListGroupProps) {
  const { colors, radius } = useTheme()
  const isCard = variant === 'card' || variant === 'iconCard'
  const rows = Children.toArray(children)
  return (
    <ListVariantContext.Provider value={variant}>
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: isCard ? radius.card : large ? radius.groupLarge : radius.group,
          ...(isCard ? { borderCurve: 'continuous' as const } : null),
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
                  marginLeft:
                    inset ??
                    (variant === 'iconCard'
                      ? ICON_CARD_SEPARATOR_INSET
                      : isCard
                        ? CARD_SEPARATOR_INSET
                        : 53),
                  backgroundColor: colors.separator,
                }}
              />
            ) : null}
            {row}
          </Fragment>
        ))}
      </View>
    </ListVariantContext.Provider>
  )
}
