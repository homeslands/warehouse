import { SIDEBAR_COOKIE_NAME } from '@/shared/ui/sidebar-context'

/**
 * Trạng thái thu gọn/mở đã lưu. `SidebarProvider` của shadcn chỉ GHI cookie (app Next.js đọc ở
 * server); SPA tự đọc rồi truyền vào `defaultOpen`. Chưa có cookie → mở.
 */
export function readSidebarOpenCookie(cookie: string = document.cookie): boolean {
  const entry = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SIDEBAR_COOKIE_NAME}=`))
  return entry?.slice(SIDEBAR_COOKIE_NAME.length + 1) !== 'false'
}
