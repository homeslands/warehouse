import { Stack } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'

import { tabHeaderRight } from '@/features/warehouse-picker'
import { fontStyle } from '@/shared/theme/fonts'
import { useTheme } from '@/shared/theme/useTheme'

import type { TabKey } from './tabs'

/**
 * Stack lồng của MỘT tab — mỗi tab có đúng một header, là header native của Stack này (thanh tab gốc
 * không có header). Khuôn header chuẩn:
 * - Màn đầu của tab: tiêu đề lớn `nav:<tab>` thu lại khi cuộn, KHÔNG có mục trái; nút kho ở ngoài
 *   cùng bên PHẢI (`tabHeaderRight`). Màn có nút riêng bên phải khai qua `tabHeaderRight({ ios,
 *   android })` để nút kho luôn đứng cuối.
 * - Màn con (push): nút back CHỈ icon (`headerBackButtonDisplayMode: 'minimal'`, không chữ), tiêu đề
 *   nhỏ một dòng ở giữa do màn tự khai qua `<Stack.Screen options={{ title }}>`, nút phải nếu có.
 * iOS 26/27: KHÔNG đặt nền header để thanh dùng nền kính của hệ thống; Android: nền nhóm.
 */
export function TabStackLayout({ tab }: { tab: TabKey }) {
  const { t } = useTranslation('nav')
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
      <Stack.Screen
        name="index"
        options={{
          title: t(tab),
          // Màn gốc giữ tiêu đề bên trái (Android); `center` ở screenOptions chỉ dành cho màn con.
          headerTitleAlign: 'left',
          headerLargeTitleEnabled: true,
          headerLargeTitleShadowVisible: false,
          headerLargeTitleStyle: { fontWeight: '700', color: colors.foreground },
          ...tabHeaderRight(),
        }}
      />
      {/* Tồn kho: chi tiết vật tư (push). Tiêu đề (mã vật tư) do màn tự khai khi đã có dữ liệu. */}
      {tab === 'stock' ? <Stack.Screen name="[materialSlug]" options={{ title: '' }} /> : null}
      {/* Nhập: xem một phiếu (push, mọi trạng thái). Tiêu đề (mã phiếu) do màn tự khai khi có dữ liệu. */}
      {tab === 'import' ? <Stack.Screen name="[formSlug]/index" options={{ title: '' }} /> : null}
      {/* Xuất: xem một phiếu (push, mọi trạng thái). Tiêu đề (mã phiếu) do màn tự khai khi có dữ liệu. */}
      {tab === 'export' ? <Stack.Screen name="[formSlug]/index" options={{ title: '' }} /> : null}
      {/* Xuất: link cũ `/export/[formSlug]/info|edit|review` → modal `/export-form/…` (`useHandOffToModal`). */}
      {tab === 'export' ? <Stack.Screen name="[formSlug]/info" options={{ title: '' }} /> : null}
      {tab === 'export' ? <Stack.Screen name="[formSlug]/edit" options={{ title: '' }} /> : null}
      {tab === 'export' ? <Stack.Screen name="[formSlug]/review" options={{ title: '' }} /> : null}
      {/* Xuất: link cũ `/export/create` → modal `/export-form/new/info` (tên tĩnh `create` thắng `[formSlug]`). */}
      {tab === 'export' ? <Stack.Screen name="create" options={{ title: '' }} /> : null}
      {/* Nhập: checklist Kiểm hàng của một phiếu Nháp (push từ màn xem). */}
      {tab === 'import' ? <Stack.Screen name="[formSlug]/receive" options={{ title: '' }} /> : null}
      {/* Nhập: link cũ `/import/[formSlug]/info|edit|review` → modal `/import-form/…` (`useHandOffToModal`). */}
      {tab === 'import' ? <Stack.Screen name="[formSlug]/info" options={{ title: '' }} /> : null}
      {tab === 'import' ? <Stack.Screen name="[formSlug]/edit" options={{ title: '' }} /> : null}
      {tab === 'import' ? <Stack.Screen name="[formSlug]/review" options={{ title: '' }} /> : null}
      {/* Nhập: link cũ `/import/create` → modal `/import-form/new/info` (tên tĩnh `create` thắng `[formSlug]`). */}
      {tab === 'import' ? <Stack.Screen name="create" options={{ title: '' }} /> : null}
    </Stack>
  )
}
