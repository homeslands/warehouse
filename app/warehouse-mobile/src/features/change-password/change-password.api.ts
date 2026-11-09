import { postData } from '@/shared/api/http'
import { CHANGE_PASSWORD_PATH } from '@/shared/api/routes'
import type { AuthTokens } from '@/shared/api/types'

/** Backend trả `{ tokens }`; đổi mật khẩu thu hồi các phiên khác nên cặp token mới thay cặp cũ. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AuthTokens> {
  const result = await postData<{ tokens: AuthTokens }>(CHANGE_PASSWORD_PATH, {
    currentPassword,
    newPassword,
  })
  return result.tokens
}
