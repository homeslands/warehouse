import type { AuthStatus, CurrentUser } from '@/entities/session'
import type { Resolution } from '@/entities/warehouse'

import { hasBusinessTab, tabsFor } from './tabs'

/**
 * Nơi app phải đứng, suy ra thuần từ `(status, kho, user)`. `splash` = chưa biết (đang khởi động /
 * đang nạp hồ sơ / đang resolve kho). `noWarehouse` và `noAccess` cùng route `/no-access`.
 */
export type Destination =
  'splash' | 'offline' | 'login' | 'noWarehouse' | 'select-warehouse' | 'noAccess' | 'tabs'

export function destinationFor(
  status: AuthStatus,
  resolution: Resolution | null,
  user: CurrentUser | null,
): Destination {
  switch (status) {
    case 'loading':
      return 'splash'
    case 'offline':
      return 'offline'
    case 'unauthenticated':
      return 'login'
    case 'authenticated':
      if (resolution === null) return 'splash'
      if (resolution === 'none') return 'noWarehouse'
      // Tải danh sách kho lỗi (ADMIN+): màn chọn kho báo lỗi + Thử lại — không phải "chưa được gán kho".
      if (resolution === 'choose' || resolution === 'error') return 'select-warehouse'
      return hasBusinessTab(user) ? 'tabs' : 'noAccess'
  }
}

/**
 * Route của một đích — dùng làm `redirectTo` cho mọi `Stack.Protected`. Không để Expo Router tự chọn
 * "màn đầu tiên còn mở": với nhóm `(tabs)` (không có `index`) nó ra `/(tabs)` và rơi vào +not-found.
 */
export function hrefFor(destination: Destination, user: CurrentUser | null): string | null {
  switch (destination) {
    case 'login':
      return '/login'
    case 'select-warehouse':
      return '/select-warehouse'
    case 'noWarehouse':
    case 'noAccess':
      return '/no-access'
    case 'tabs':
      return `/${tabsFor(user)[0]}`
    case 'splash':
    case 'offline':
      return null
  }
}
