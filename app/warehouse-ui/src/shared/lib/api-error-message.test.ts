import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'

const apiError = (over: Record<string, unknown> = {}) => ({
  statusCode: 422,
  timestamp: '',
  path: '/examples',
  method: 'POST',
  message: 'Example not found',
  ...over,
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveApiErrorMessage', () => {
  it('ánh xạ mã 999901 sang khoá errors:exampleNotFound', () => {
    expect(resolveApiErrorMessage(apiError({ code: 999901 }))).toBe(
      i18n.t('errors:exampleNotFound'),
    )
  })

  it('bám theo ngôn ngữ đang chọn', async () => {
    const vi_ = resolveApiErrorMessage(apiError({ code: 999901 }))

    await i18n.changeLanguage('en')
    const en_ = resolveApiErrorMessage(apiError({ code: 999901 }))
    expect(en_).toBe(i18n.t('errors:exampleNotFound'))
    await i18n.changeLanguage('vi')

    // Hai ngôn ngữ phải ra hai chuỗi khác nhau, nếu không phép dịch đã không xảy ra.
    expect(en_).not.toBe(vi_)
  })

  it('mã lạ → dùng message của backend và cảnh báo', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveApiErrorMessage(apiError({ code: 424242, message: 'Weird failure' }))).toBe(
      'Weird failure',
    )
    expect(warn).toHaveBeenCalledOnce()
  })

  it('không có code → dùng message của backend', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveApiErrorMessage(apiError({ message: 'Plain failure' }))).toBe('Plain failure')
    expect(warn).toHaveBeenCalledOnce()
  })

  it('không phải ApiError (lỗi mạng) → khoá errors:network', () => {
    expect(resolveApiErrorMessage(new Error('Network Error'))).toBe(i18n.t('errors:network'))
  })

  it('ánh xạ mã 100800 (xung đột version) sang khoá errors:dataVersionConflict', () => {
    expect(
      resolveApiErrorMessage(
        apiError({ statusCode: 409, code: 100800, message: 'Data has been modified' }),
      ),
    ).toBe(i18n.t('errors:dataVersionConflict'))
  })

  it.each([
    [100003, 'errors:invalidRefreshToken'],
    [100004, 'errors:refreshTokenExpired'],
    [100005, 'errors:refreshTokenRevoked'],
    [100008, 'errors:refreshTokenIsRequired'],
    [100011, 'errors:newPasswordIsRequired'],
    [100012, 'errors:currentPasswordIsRequired'],
    [100013, 'errors:currentPasswordIncorrect'],
    [100401, 'errors:phonenumberDoesExist'],
    [100402, 'errors:phonenumberIsRequired'],
    [100403, 'errors:passwordIsRequired'],
    [100404, 'errors:roleSlugIsRequired'],
    [100405, 'errors:userNotFound'],
    [100406, 'errors:newPasswordIsRequired'],
    [100407, 'errors:changePasswordForbidden'],
    [100408, 'errors:changeOwnPasswordNotAllowed'],
    [100409, 'errors:phonenumberInvalid'],
  ] as const)('mã %i khớp backend hiện tại → %s', (code, key) => {
    expect(resolveApiErrorMessage(apiError({ code }))).toBe(i18n.t(key))
  })

  it('100005 là thu hồi phiên, KHÔNG còn là "số điện thoại đã tồn tại"', () => {
    expect(resolveApiErrorMessage(apiError({ code: 100005 }))).not.toBe(
      i18n.t('errors:phonenumberDoesExist'),
    )
  })
})
