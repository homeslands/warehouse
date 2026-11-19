import { Stack } from 'expo-router'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'

import { tabHeaderRight } from '@/features/warehouse-picker'
import { fontStyle } from '@/shared/theme/fonts'
import { useTheme } from '@/shared/theme/useTheme'

import type { TabKey } from './tabs'

type StackRouterOverride = NonNullable<ComponentProps<typeof Stack>['UNSTABLE_router']>

/**
 * `navigate` tới màn đầu (`index`) của tab luôn QUAY VỀ màn đầu sẵn có (như `pop: true` của React
 * Navigation) thay vì đẩy thêm một `index` lên trên màn con. Cần cho tab Tổng quan: chạm số mở
 * `/export?preset=…` khi tab Xuất đang mở màn xem phiếu → về danh sách đã lọc, không chồng
 * `[index, màn xem, index]`. `push` không bị đổi. Hàm thuần (yêu cầu của `UNSTABLE_router`).
 */
const navigateToIndexPops: StackRouterOverride = (original) => ({
  getStateForAction(state, action, options) {
    const payload = action.payload as { name?: string; pop?: boolean } | undefined
    if (action.type === 'NAVIGATE' && payload?.name === 'index' && !payload.pop)
      return original.getStateForAction(
        state,
        { ...action, payload: { ...payload, pop: true } } as typeof action,
        options,
      )
    return original.getStateForAction(state, action, options)
  },
})

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
      UNSTABLE_router={navigateToIndexPops}
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
      {/* Tổng quan: chi tiết Nhập kho / Xuất kho / Hoạt động (push). Tiêu đề do màn tự khai theo `metric`. */}
      {tab === 'overview' ? <Stack.Screen name="[metric]" options={{ title: '' }} /> : null}
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
      {/* Tài khoản: danh mục Đơn vị / Loại vật tư (push): danh sách rồi chi tiết. Tiêu đề do màn tự khai. */}
      {tab === 'account' ? <Stack.Screen name="materials/index" options={{ title: '' }} /> : null}
      {tab === 'account' ? <Stack.Screen name="materials/[slug]" options={{ title: '' }} /> : null}
      {tab === 'account' ? <Stack.Screen name="units/index" options={{ title: '' }} /> : null}
      {tab === 'account' ? <Stack.Screen name="units/[slug]" options={{ title: '' }} /> : null}
      {tab === 'account' ? (
        <Stack.Screen name="material-types/index" options={{ title: '' }} />
      ) : null}
      {tab === 'account' ? (
        <Stack.Screen name="material-types/[slug]" options={{ title: '' }} />
      ) : null}
    </Stack>
  )
}
