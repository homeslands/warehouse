import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuthStore } from './auth.store'
import type { CurrentUser } from './permissions'
import { refreshCurrentUser } from './refresh-user'

/** Ẩn tab ngắn hơn mức này (liếc qua tab khác) thì không kiểm tra. */
const MIN_HIDDEN_MS = 30_000
/** Hai lần kiểm tra cách nhau ít nhất chừng này — tính cả lần nạp `/auth/me` lúc mở phiên. */
const MIN_INTERVAL_MS = 60_000

/**
 * Luật "quay lại tab có nên kiểm tra quyền không", tách thành hàm thuần để test tất định: hook gọi
 * `refreshCurrentUser` kiểu bắn-rồi-quên, không mock được từ test (barrel `entities/session` đã được
 * `src/app/test-setup.ts` nạp trước khi `vi.mock` kịp chen vào).
 */
export function shouldRecheck({
  hiddenFor,
  sinceLastCheck,
  authenticated,
}: {
  hiddenFor: number
  sinceLastCheck: number
  authenticated: boolean
}): boolean {
  return authenticated && hiddenFor >= MIN_HIDDEN_MS && sinceLastCheck >= MIN_INTERVAL_MS
}

function sameGrants(a: CurrentUser, b: CurrentUser): boolean {
  if (a.roleName !== b.roleName || a.scope.length !== b.scope.length) return false
  const scope = new Set(a.scope)
  return b.scope.every((code) => scope.has(code))
}

/**
 * Quay lại tab sau một lúc vắng → nạp lại quyền. Bắt được chiều **được cấp thêm** quyền, thứ mà
 * chốt 403 ở `app/query-client.ts` không bao giờ thấy (được cấp quyền không sinh ra lỗi nào).
 *
 * Rẻ: một `GET /auth/me` (scope từ Redis + một truy vấn user theo khoá chính), và bị chặn hai lớp —
 * ẩn tab đủ lâu (`MIN_HIDDEN_MS`) VÀ đủ xa lần trước (`MIN_INTERVAL_MS`).
 *
 * Quyền đổi thì báo bằng toast thông tin; menu, nút và `RoleGate` đọc store nên tự cập nhật.
 */
export function usePermissionSync(): void {
  const { t } = useTranslation(['auth'])

  useEffect(() => {
    let hiddenAt: number | null = null
    // Mốc = lúc mount: `useSession` vừa nạp /auth/me khi mở phiên, gọi lại ngay là thừa.
    let lastCheck = Date.now()

    const onVisibilityChange = () => {
      const now = Date.now()
      if (document.visibilityState === 'hidden') {
        hiddenAt = now
        return
      }

      const hiddenFor = hiddenAt === null ? 0 : now - hiddenAt
      hiddenAt = null
      const { status, user: before } = useAuthStore.getState()
      const authenticated = status === 'authenticated' && before !== null
      if (!shouldRecheck({ hiddenFor, sinceLastCheck: now - lastCheck, authenticated })) return
      if (!before) return

      lastCheck = now
      refreshCurrentUser()
        .then(() => {
          const after = useAuthStore.getState().user
          if (after && !sameGrants(before, after)) toast.info(t('auth:permissionsUpdated'))
        })
        // Việc phụ: lỗi mạng thì lần quay lại sau thử tiếp; 401 do interceptor lo.
        .catch(() => {})
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [t])
}
