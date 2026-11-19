import { NativeTabs } from 'expo-router/native-tabs'
import { useEffect, useMemo, useState } from 'react'
import { AppState, Platform } from 'react-native'
import { useTranslation } from 'react-i18next'

import { expiryCutoffs, useBatchCount } from '@/entities/inventory'
import { can, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { parseLocalDate, todayLocalIso } from '@/shared/lib/format'
import { fontStyle } from '@/shared/theme/fonts'
import { useTheme } from '@/shared/theme/useTheme'

import { TAB_ORDER, tabsFor, type TabKey } from './tabs'

/** iOS: SF Symbols (thường / khi chọn). Android: Material Symbols (expo-symbols vẽ ra ảnh, thuần JS). */
const ICONS = {
  overview: { sf: 'square.grid.2x2', sfSelected: 'square.grid.2x2.fill', md: 'dashboard' },
  import: {
    sf: 'tray.and.arrow.down',
    sfSelected: 'tray.and.arrow.down.fill',
    md: 'move_to_inbox',
  },
  export: { sf: 'tray.and.arrow.up', sfSelected: 'tray.and.arrow.up.fill', md: 'outbox' },
  stock: { sf: 'square.stack.3d.up', sfSelected: 'square.stack.3d.up.fill', md: 'layers' },
  account: {
    sf: 'person.crop.circle',
    sfSelected: 'person.crop.circle.fill',
    md: 'account_circle',
  },
} as const satisfies Record<TabKey, object>

/** Ngày hôm nay (giờ máy, `YYYY-MM-DD`): tính lại mỗi render và khi app về foreground (qua nửa đêm). */
function useToday(): string {
  const [, setDay] = useState(todayLocalIso)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      // Cùng ngày → cùng chuỗi → React bỏ qua, không render lại thanh tab.
      if (state === 'active') setDay(todayLocalIso())
    })
    return () => sub.remove()
  }, [])
  return todayLocalIso()
}

/**
 * Số lô QUÁ HẠN của kho đang chọn cho chấm đỏ trên tab Tổng quan: cùng query đếm (`useBatchCount`, mốc
 * hôm nay) với màn Tổng quan / sheet Hạn dùng nên không thêm request. Không quyền tồn kho → không gọi
 * API; 0 / chưa có số / lỗi → `undefined` (không chấm).
 */
function useExpiredBadge(enabled: boolean): string | undefined {
  const slug = useWarehouseStore((s) => s.current?.slug)
  const today = useToday()
  const cutoff = useMemo(() => expiryCutoffs(parseLocalDate(today)).expired, [today])
  const { data } = useBatchCount(slug, cutoff, enabled)
  return enabled && data !== undefined && data > 0 ? String(data) : undefined
}

/**
 * Thanh tab GỐC của hệ thống (`NativeTabs`): iOS 26/27 là thanh viên thuốc nổi Liquid Glass, Android
 * là thanh Material. Tab không có quyền đọc bị `hidden` — ẩn khỏi thanh và không điều hướng tới được
 * (thay cho `Tabs.Protected` của tab JS). Đổi quyền khi quay lại app làm navigator dựng lại (docs) —
 * tab đang mở bị ẩn thì sang tab còn lại đầu tiên. Mỗi tab là một Stack lồng có header riêng
 * (`TabStackLayout`). Tab Tổng quan có chấm đỏ (badge hệ thống) = số lô quá hạn khi có quyền tồn kho.
 */
export function TabsLayout() {
  const { t } = useTranslation('nav')
  const { colors } = useTheme()
  const user = useAuthStore((s) => s.user)
  const visible = tabsFor(user)
  const android = Platform.OS === 'android'
  const expiredBadge = useExpiredBadge(
    can(user, 'MATERIAL_READ') && can(user, 'WAREHOUSE_READ') && visible.includes('overview'),
  )

  return (
    <NativeTabs
      // iOS: thanh kính của hệ thống, chữ / icon màu chữ thường. Android (thanh Material 3): icon tab đang
      // chọn màu accent trên viên chỉ báo accentSoft (thay màu tím mặc định của Material), nhãn tab đang
      // chọn màu chữ chính đậm (như Material 3; chữ xanh nhỏ trên nền trắng không đủ tương phản 4,5:1),
      // tab khác xám, nền thẻ theo theme sáng / tối, luôn hiện nhãn.
      tintColor={android ? colors.accent : colors.foreground}
      iconColor={android ? { default: colors.mutedForeground, selected: colors.accent } : undefined}
      labelStyle={
        android
          ? {
              default: { ...fontStyle('medium'), color: colors.mutedForeground },
              selected: { ...fontStyle('semibold'), color: colors.foreground },
            }
          : fontStyle('medium')
      }
      backgroundColor={android ? colors.card : undefined}
      indicatorColor={colors.accentSoft}
      rippleColor={colors.accentSoft}
      labelVisibilityMode="labeled"
      // Danh sách dài là FlatList: docs khuyên tắt nền trong suốt ở mép cuộn.
      disableTransparentOnScrollEdge
    >
      {TAB_ORDER.map((tab) => (
        <NativeTabs.Trigger
          key={tab}
          name={tab}
          hidden={!visible.includes(tab)}
          testID={`tab-${tab}`}
        >
          {/* Nhãn tab ngắn (mockup A); tiêu đề lớn trong màn dùng nhãn dài `nav:<tab>`. */}
          <NativeTabs.Trigger.Label>{t(`tab.${tab}`)}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: ICONS[tab].sf, selected: ICONS[tab].sfSelected }}
            md={ICONS[tab].md}
          />
          {/* Không gắn Badge khi không có số: Badge rỗng vẫn vẽ chấm (expo-router gán `' '`). */}
          {tab === 'overview' && expiredBadge ? (
            <NativeTabs.Trigger.Badge>{expiredBadge}</NativeTabs.Trigger.Badge>
          ) : null}
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  )
}
