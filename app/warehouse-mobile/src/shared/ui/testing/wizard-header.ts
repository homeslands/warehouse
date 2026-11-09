/**
 * Đọc header của các bước form 3 bước (`WizardHeader`) từ `options` mà mock `Stack.Screen` ghi lại (test
 * màn đơn lẻ, iOS): mục phải (`unstable_headerRightItems`), menu `⋯` gốc (`type: 'menu'`, mục có
 * `destructive` / `disabled`) và nút quét. Trên Stack THẬT (`routing.test.tsx`) menu nằm ở prop
 * `headerRightBarButtonItems` của `RNSScreenStackHeaderConfig` — xem helper ở đó.
 */
import type {
  NativeStackHeaderItem,
  NativeStackHeaderItemMenu,
  NativeStackHeaderItemMenuAction,
  NativeStackNavigationOptions,
} from 'expo-router'

export function wizardRightItems(options: NativeStackNavigationOptions): NativeStackHeaderItem[] {
  return options.unstable_headerRightItems?.({ tintColor: undefined, canGoBack: true }) ?? []
}

/** Mục `⋯` (menu gốc) bên phải, hoặc `undefined` khi không có. */
export function wizardMenuButton(
  options: NativeStackNavigationOptions,
): NativeStackHeaderItemMenu | undefined {
  return wizardRightItems(options).find((i): i is NativeStackHeaderItemMenu => i.type === 'menu')
}

/** Các mục của menu `⋯` (rỗng khi không có `⋯`). */
export function wizardMenu(
  options: NativeStackNavigationOptions,
): NativeStackHeaderItemMenuAction[] {
  return (wizardMenuButton(options)?.menu.items ?? []).filter(
    (i): i is NativeStackHeaderItemMenuAction => i.type === 'action',
  )
}

export const wizardMenuLabels = (options: NativeStackNavigationOptions) =>
  wizardMenu(options).map((i) => i.label)

export function wizardMenuItem(
  options: NativeStackNavigationOptions,
  label: string,
): NativeStackHeaderItemMenuAction | undefined {
  return wizardMenu(options).find((i) => i.label === label)
}
