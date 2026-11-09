import { NativeTabs } from 'expo-router/native-tabs'
import { useTranslation } from 'react-i18next'

import { useAuthStore } from '@/entities/session'
import { fontStyle } from '@/shared/theme/fonts'
import { useTheme } from '@/shared/theme/useTheme'

import { TAB_ORDER, tabsFor, type TabKey } from './tabs'

/** iOS: SF Symbols (thường / khi chọn). Android: Material Symbols (expo-symbols vẽ ra ảnh, thuần JS). */
const ICONS = {
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

/**
 * Thanh tab GỐC của hệ thống (`NativeTabs`): iOS 26/27 là thanh viên thuốc nổi Liquid Glass, Android
 * là thanh Material. Tab không có quyền đọc bị `hidden` — ẩn khỏi thanh và không điều hướng tới được
 * (thay cho `Tabs.Protected` của tab JS). Đổi quyền khi quay lại app làm navigator dựng lại (docs) —
 * tab đang mở bị ẩn thì sang tab còn lại đầu tiên. Mỗi tab là một Stack lồng có header riêng
 * (`TabStackLayout`).
 */
export function TabsLayout() {
  const { t } = useTranslation('nav')
  const { colors } = useTheme()
  const user = useAuthStore((s) => s.user)
  const visible = tabsFor(user)

  return (
    <NativeTabs
      tintColor={colors.foreground}
      labelStyle={fontStyle('medium')}
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
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  )
}
