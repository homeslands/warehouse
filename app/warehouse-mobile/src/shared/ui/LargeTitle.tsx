import { Text } from './Text'

/** Tiêu đề lớn đầu màn kiểu iOS ("Tài khoản", "Nhập kho"). Là header cho trình đọc màn hình. */
export function LargeTitle({ children }: { children: string }) {
  return (
    <Text
      weight="bold"
      size={28}
      accessibilityRole="header"
      style={{ letterSpacing: -0.7, paddingHorizontal: 6, paddingTop: 6, paddingBottom: 12 }}
    >
      {children}
    </Text>
  )
}
