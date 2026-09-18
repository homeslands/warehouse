import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Dữ liệu menu, không biết gì về nghiệp vụ hay quyền: tầng `app` dựng từ `handle` của route
 * (`app/routes/nav.ts` → `buildNav`) rồi truyền xuống widget/page. `labelKey` là khoá i18n có
 * namespace (`'nav:materials'`).
 */
export type NavItem = { to: string; labelKey: string; icon: LucideIcon }

export type NavGroup = { key: string; labelKey: string; items: NavItem[] }

/**
 * Hàm dịch cho `labelKey` của `NavItem`/`NavGroup`. Khoá đến từ dữ liệu (tầng app đã kiểm lúc biên
 * dịch bằng `satisfies AppRouteHandle`) nên ở đây bỏ kiểu khoá chặt của i18next. Là hook để
 * component render lại khi đổi ngôn ngữ.
 */
export function useNavLabel(): (key: string) => string {
  const { t } = useTranslation('nav')
  return t as unknown as (key: string) => string
}

/**
 * Mục menu đang mở: khớp theo tiền tố đường dẫn (`/materials/abc` thuộc `/materials`), không
 * khớp tiền tố lửng (`/materials-types`). `'/'` chỉ khớp đúng `'/'`. Truyền `pathname` (không
 * gồm query), nên `/examples?page=2` vẫn thuộc `/examples`.
 */
export function isNavActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}
