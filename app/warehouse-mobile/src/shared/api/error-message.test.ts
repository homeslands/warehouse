import { AxiosError } from 'axios'

import i18n, { initI18n } from '@/shared/i18n'

import { errorMessage } from './error-message'

jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'vi' }]) }))

const base = { timestamp: '', path: '/x', method: 'POST' }

beforeAll(async () => {
  await initI18n()
})

describe('errorMessage', () => {
  it('401 + 100001 → câu "Sai số điện thoại hoặc mật khẩu" của namespace errors', () => {
    const msg = errorMessage(
      { ...base, statusCode: 401, code: 100001, message: 'Unauthorized' },
      i18n.t,
    )
    expect(msg).toBe(i18n.t('errors:invalidCredentials'))
    expect(msg).toBe('Số điện thoại hoặc mật khẩu không đúng')
  })

  it('mã khác trong bảng → khoá tương ứng (đổi mật khẩu sai mật khẩu hiện tại)', () => {
    expect(errorMessage({ ...base, statusCode: 400, code: 100013, message: 'x' }, i18n.t)).toBe(
      i18n.t('errors:currentPasswordIncorrect'),
    )
  })

  it('đổi ngôn ngữ thì câu đổi theo', async () => {
    await i18n.changeLanguage('en')
    try {
      expect(errorMessage({ ...base, statusCode: 401, code: 100001, message: 'x' }, i18n.t)).toBe(
        'Invalid phone number or password',
      )
    } finally {
      await i18n.changeLanguage('vi')
    }
  })

  it('403 do guard phân quyền → permissionDenied', () => {
    expect(errorMessage({ ...base, statusCode: 403, message: 'Forbidden resource' }, i18n.t)).toBe(
      i18n.t('errors:permissionDenied'),
    )
  })

  it('lỗi axios không có response (mất mạng, hết giờ) → common.offline', () => {
    const e = new AxiosError('Network Error', 'ERR_NETWORK')
    expect(errorMessage(e, i18n.t)).toBe(i18n.t('common:offline'))
  })

  it('mã lỗi không có trong bảng → câu chung, không lộ message tiếng Anh của backend; cảnh báo dev', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      errorMessage({ ...base, statusCode: 422, code: 424242, message: 'Backend english' }, i18n.t),
    ).toBe(i18n.t('errors:unknown'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('424242'))
    warn.mockRestore()
  })

  it('lỗi không phải ApiError / axios → câu chung', () => {
    expect(errorMessage(new Error('boom'), i18n.t)).toBe(i18n.t('errors:unknown'))
    expect(errorMessage(undefined, i18n.t)).toBe(i18n.t('errors:unknown'))
    expect(errorMessage('x', i18n.t)).toBe(i18n.t('errors:unknown'))
  })

  it('5xx không code → câu chung; cảnh báo dev', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(errorMessage({ ...base, statusCode: 500, message: 'Internal' }, i18n.t)).toBe(
      i18n.t('errors:unknown'),
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Internal'))
    warn.mockRestore()
  })
})
