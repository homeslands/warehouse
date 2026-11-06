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

/** UI-02: luôn nhớ trang đang mở để mở khoá xong quay lại đúng chỗ (draft còn trong memory). */
export function lockedPathFor(location: {
  pathname: string
  search: string
  hash: string
}): string {
  const target = `${location.pathname}${location.search}${location.hash}`
  return `/locked?redirect=${encodeURIComponent(target)}`
}
