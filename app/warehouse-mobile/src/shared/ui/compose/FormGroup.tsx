import type { ReactNode } from 'react'
import { View, type LayoutChangeEvent } from 'react-native'

import { useTheme } from '../../theme/useTheme'
import { SectionFooter } from '../SectionFooter'
import { SectionHeader } from '../SectionHeader'
import { Text } from '../Text'

export type FormGroupProps = {
  /** Tiêu đề nhỏ phía trên nhóm (viết thường, đậm vừa). */
  title?: string
  /** Chú thích mờ dưới nhóm. */
  footer?: string
  /** Chú thích có số → `Text numeric`. */
  footerNumeric?: boolean
  /** Câu lỗi dưới nhóm (đỏ, đọc ngay khi hiện); mục null / trống bị bỏ qua. */
  errors?: readonly (string | null | undefined)[]
  testID?: string
  onLayout?: (e: LayoutChangeEvent) => void
  children: ReactNode
}

/**
 * Nhóm kiểu Cài đặt iOS (inset-grouped): [tiêu đề][thẻ bo `groupLarge` chứa các dòng 44pt kẻ mảnh lùi 16][lỗi][chú
 * thích]. Đặt trên nền `grouped` (`SheetScaffold grouped`).
 */
export function FormGroup({
  title,
  footer,
  footerNumeric,
  errors,
  testID,
  onLayout,
  children,
}: FormGroupProps) {
  const { colors, radius } = useTheme()
  const shown = (errors ?? []).filter((e): e is string => !!e)
  return (
    <View testID={testID} onLayout={onLayout}>
      {title ? <SectionHeader variant="sentence">{title}</SectionHeader> : null}
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: radius.groupLarge,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
      {shown.map((message) => (
        <Text
          key={message}
          size={13}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{ color: colors.destructiveText, paddingHorizontal: 16, paddingTop: 6 }}
        >
          {message}
        </Text>
      ))}
      {footer ? <SectionFooter numeric={footerNumeric}>{footer}</SectionFooter> : null}
    </View>
  )
}
