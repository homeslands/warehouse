import type { TFunction } from 'i18next'
import { ListFilter, ScanBarcode } from '@/shared/ui/icons'
import type {
  NativeStackHeaderItem,
  NativeStackHeaderItemMenu,
  NativeStackHeaderItemMenuAction,
} from 'expo-router'
import { Pressable, View } from 'react-native'

import { useTheme } from '@/shared/theme/useTheme'

import type { StockLevelFilter } from './stock-filter.store'

export type FilterMenuArgs = {
  level: StockLevelFilter | undefined
  typeSlug: string | undefined
  types: { slug: string; name: string }[]
  t: TFunction
  onLevel: (level: StockLevelFilter | undefined) => void
  onType: (typeSlug: string | undefined) => void
}

export const isFilterActive = (level: unknown, typeSlug: unknown) =>
  level !== undefined || typeSlug !== undefined

const action = (
  label: string,
  on: boolean,
  onPress: () => void,
): NativeStackHeaderItemMenuAction => ({
  type: 'action',
  label,
  state: on ? 'on' : 'off',
  onPress,
})

/**
 * Nút "Lọc" bên phải thanh (iOS): menu GỐC (UIMenu) hai nhóm chọn một, có dấu tích — "Mức tồn"
 * (Tất cả / Dưới tối thiểu / Vượt tối đa) và "Loại vật tư" (Tất cả loại + từng loại). Đang lọc thì
 * icon đặc. Chọn lại mục đang chọn không đổi gì.
 */
export function filterMenuItem({
  level,
  typeSlug,
  types,
  t,
  onLevel,
  onType,
}: FilterMenuArgs): NativeStackHeaderItemMenu {
  const active = isFilterActive(level, typeSlug)
  const levels: [StockLevelFilter | undefined, string][] = [
    [undefined, t('inventory:alertAll')],
    ['low', t('inventory:alertBelow')],
    ['high', t('inventory:alertAbove')],
  ]
  return {
    type: 'menu',
    label: t('inventory:filter'),
    accessibilityLabel: active ? t('inventory:filterOn') : t('inventory:filter'),
    icon: {
      type: 'sfSymbol',
      name: active ? 'line.3.horizontal.decrease.circle.fill' : 'line.3.horizontal.decrease.circle',
    },
    menu: {
      items: [
        {
          type: 'submenu',
          label: t('inventory:levelSection'),
          inline: true,
          items: levels.map(([value, label]) =>
            action(label, level === value, () => onLevel(value)),
          ),
        },
        {
          type: 'submenu',
          label: t('inventory:filterType'),
          inline: true,
          items: [
            action(t('inventory:filterTypeAll'), typeSlug === undefined, () => onType(undefined)),
            ...types.map((ty) => action(ty.name, typeSlug === ty.slug, () => onType(ty.slug))),
          ],
        },
      ],
    },
  }
}

export type StockHeaderItemsArgs = FilterMenuArgs & {
  /** Nút "Quét mã" (mở sheet `/scan-material`). iOS gộp các mục bên phải vào một viên kính. */
  scan?: { label: string; onPress: () => void }
}

/** Mục bên phải thanh của tab Tồn kho trên iOS: [Quét mã?, Lọc]. */
export function stockHeaderRightItems({
  scan,
  ...filter
}: StockHeaderItemsArgs): NativeStackHeaderItem[] {
  const items: NativeStackHeaderItem[] = []
  if (scan) {
    items.push({
      type: 'button',
      label: scan.label,
      icon: { type: 'sfSymbol', name: 'barcode.viewfinder' },
      onPress: scan.onPress,
    })
  }
  items.push(filterMenuItem(filter))
  return items
}

/**
 * Android: nút "Lọc" phẳng trên header (không có UIMenu) — mở sheet chọn `/stock-filter`. Đang lọc
 * thì có chấm nhỏ trên icon. Vùng chạm 44.
 */
export function AndroidFilterButton({
  active,
  label,
  onPress,
}: {
  active: boolean
  label: string
  onPress: () => void
}) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <ListFilter size={22} color={colors.foreground} aria-hidden />
      {active ? (
        <View
          aria-hidden
          style={{
            position: 'absolute',
            top: 10,
            right: 9,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.info,
          }}
        />
      ) : null}
    </Pressable>
  )
}

/** Android: nút "Quét mã" phẳng cạnh nút Lọc — mở sheet `/scan-material`. Vùng chạm 44. */
export function AndroidScanButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <ScanBarcode size={22} color={colors.foreground} aria-hidden />
    </Pressable>
  )
}
