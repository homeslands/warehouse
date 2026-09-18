import type { SessionEndReason } from '@/shared/api/types'

/** Tự đăng xuất thì không nhớ trang cũ; mọi trường hợp khác nhớ để đăng nhập xong quay lại. */
export function loginPathFor(
  location: { pathname: string; search: string; hash: string },
  endReason: SessionEndReason | null,
): string {
  if (endReason === 'loggedOut') return '/login'
  const target = `${location.pathname}${location.search}${location.hash}`
  return `/login?redirect=${encodeURIComponent(target)}`
}
