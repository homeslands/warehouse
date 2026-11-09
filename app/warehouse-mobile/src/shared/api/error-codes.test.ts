import enErrors from '@/shared/i18n/locales/en/errors.json'
import viErrors from '@/shared/i18n/locales/vi/errors.json'

import { DATA_VERSION_CONFLICT_CODE, ERROR_CODE_KEYS } from './error-codes'

describe('ERROR_CODE_KEYS', () => {
  it('mã đăng nhập / phiên map đúng khoá — http.ts và màn login dựa vào bảng này', () => {
    expect(ERROR_CODE_KEYS[100001]).toBe('invalidCredentials')
    expect(ERROR_CODE_KEYS[100002]).toBe('userNotActive')
    expect(ERROR_CODE_KEYS[100003]).toBe('invalidRefreshToken')
    expect(ERROR_CODE_KEYS[100004]).toBe('refreshTokenExpired')
    expect(ERROR_CODE_KEYS[100005]).toBe('refreshTokenRevoked')
    expect(ERROR_CODE_KEYS[100013]).toBe('currentPasswordIncorrect')
  })

  it('mọi khoá trong bảng đều có bản dịch vi VÀ en — thiếu là người dùng thấy câu chung', () => {
    const missing: string[] = []
    for (const [code, key] of Object.entries(ERROR_CODE_KEYS)) {
      if (!(key in viErrors)) missing.push(`mã ${code} → "${key}" thiếu ở vi`)
      if (!(key in enErrors)) missing.push(`mã ${code} → "${key}" thiếu ở en`)
    }
    expect(missing).toEqual([])
  })

  it('vi và en có đúng cùng một bộ khoá', () => {
    expect(Object.keys(enErrors).sort()).toEqual(Object.keys(viErrors).sort())
  })

  it('DATA_VERSION_CONFLICT_CODE', () => {
    expect(DATA_VERSION_CONFLICT_CODE).toBe(100800)
  })
})
