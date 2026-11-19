import { useTheme } from '../theme/useTheme'
import { Text } from './Text'

/**
 * Tiêu đề nhỏ phía trên một `ListGroup`. `caps` (mặc định): chữ hoa xám kiểu Cài đặt cũ; `sentence`:
 * viết thường, đậm hơn — kiểu iOS 26/27 (màn Tài khoản).
 */
export function SectionHeader({
  children,
  variant = 'caps',
  inset = 16,
}: {
  children: string
  variant?: 'caps' | 'sentence'
  /**
   * Lề trái của chữ. Trên thẻ variant card truyền `CARD_CONTENT_INSET` (20) để chữ thẳng cột với vòng icon
   * / nhãn của dòng trong thẻ (mặc định 16 lệch 4pt).
   */
  inset?: number
}) {
  const { colors } = useTheme()
  if (variant === 'sentence') {
    return (
      <Text
        accessibilityRole="header"
        weight="semibold"
        size={13}
        style={{ color: colors.fieldLabel, paddingHorizontal: inset, paddingBottom: 8 }}
      >
        {children}
      </Text>
    )
  }
  return (
    <Text
      accessibilityRole="header"
      weight="medium"
      size={12}
      style={{
        color: colors.groupedLabel,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        paddingHorizontal: inset,
        paddingBottom: 6,
      }}
    >
      {children}
    </Text>
  )
}
