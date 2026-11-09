import { useTheme } from '../theme/useTheme'
import { Text } from './Text'

/**
 * Tiêu đề nhỏ phía trên một `ListGroup`. `caps` (mặc định): chữ hoa xám kiểu Cài đặt cũ; `sentence`:
 * viết thường, đậm hơn — kiểu iOS 26/27 (màn Tài khoản).
 */
export function SectionHeader({
  children,
  variant = 'caps',
}: {
  children: string
  variant?: 'caps' | 'sentence'
}) {
  const { colors } = useTheme()
  if (variant === 'sentence') {
    return (
      <Text
        accessibilityRole="header"
        weight="semibold"
        size={13}
        style={{ color: colors.fieldLabel, paddingHorizontal: 16, paddingBottom: 8 }}
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
        paddingHorizontal: 16,
        paddingBottom: 6,
      }}
    >
      {children}
    </Text>
  )
}
