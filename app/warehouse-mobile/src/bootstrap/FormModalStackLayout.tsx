import { Stack } from 'expo-router'
import { Platform } from 'react-native'

import { fontStyle } from '@/shared/theme/fonts'
import { useTheme } from '@/shared/theme/useTheme'

/**
 * Stack lồng của modal form 3 bước (`app/import-form/_layout.tsx`, `app/export-form/_layout.tsx`):
 * chỉ chứa các bước của MỘT phiếu. Header như màn con của `TabStackLayout` (back chỉ icon, tiêu đề giữa
 * do màn bước khai qua `WizardHeader`); màn đầu modal có ✕ thay cho back. iOS 26/27: KHÔNG đặt nền
 * header (nền kính của hệ thống); Android: nền nhóm.
 */
export function FormModalStackLayout() {
  const { colors } = useTheme()
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
        headerTitleStyle: { ...fontStyle('semibold'), color: colors.foreground },
        ...(Platform.OS === 'android'
          ? { headerStyle: { backgroundColor: colors.grouped } }
          : null),
        contentStyle: { backgroundColor: colors.grouped },
        headerBackButtonDisplayMode: 'minimal',
        headerTitleAlign: 'center',
      }}
    >
      {/* Giữ đúng thứ tự route mặc định (abc): khác thứ tự → Stack gửi `ROUTE_NAMES_CHANGED`, mà modal
          đóng ngay khi gắn (thiếu quyền tạo) thì action đó không navigator nào xử lý. */}
      {/* Bước 2 Vật tư ("Sửa phiếu" mở thẳng bước này). */}
      <Stack.Screen name="[formSlug]/edit" options={{ title: '' }} />
      {/* Bước 1 Thông tin (phiếu mới 'new' hoặc Nháp). */}
      <Stack.Screen name="[formSlug]/info" options={{ title: '' }} />
      {/* Bước 3 Xác nhận. */}
      <Stack.Screen name="[formSlug]/review" options={{ title: '' }} />
    </Stack>
  )
}
