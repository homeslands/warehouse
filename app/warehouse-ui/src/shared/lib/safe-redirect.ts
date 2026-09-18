/** Trang Tổng quan — luôn có ở mọi môi trường (Example chỉ có khi dev). */
export const DEFAULT_AFTER_LOGIN = '/'

const PLACEHOLDER_ORIGIN = 'http://placeholder.local'

/**
 * Chỉ cho quay về đường dẫn NỘI BỘ. Giá trị đến từ query string nên người ngoài dựng được link
 * `/login?redirect=//evil.com` — không kiểm thì đăng nhập xong bị đưa sang site khác (open redirect).
 */
export function safeRedirect(
  raw: string | null | undefined,
  fallback: string = DEFAULT_AFTER_LOGIN,
): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback

  let url: URL
  try {
    url = new URL(raw, PLACEHOLDER_ORIGIN)
  } catch {
    return fallback
  }

  if (url.origin !== PLACEHOLDER_ORIGIN || url.pathname === '/login') return fallback
  return `${url.pathname}${url.search}${url.hash}`
}
