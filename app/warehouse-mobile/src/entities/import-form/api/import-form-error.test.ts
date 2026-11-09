import { AxiosError } from 'axios'

import i18n, { changeLanguage, initI18n } from '@/shared/i18n'
import { errorMessage } from '@/shared/api/error-message'

import {
  importFormErrorMessage,
  isImportFormNotFoundError,
  isStaleImportFormError,
} from './import-form-error'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const api = (statusCode: number, code?: number) => ({
  statusCode,
  code,
  message: 'x',
  timestamp: '',
  path: '',
  method: 'PATCH',
})

describe('importFormErrorMessage', () => {
  it('101333 → câu riêng về hạn dùng', () => {
    expect(importFormErrorMessage(api(400, 101333), i18n.t)).toBe(
      i18n.t('importForms:expiryBeforeDate'),
    )
    expect(i18n.t('importForms:expiryBeforeDate')).not.toBe('importForms:expiryBeforeDate')
  })

  it('101316 (tạo phiếu ở kho đã tắt — ADMIN chọn được kho tắt) → câu đọc được', () => {
    expect(importFormErrorMessage(api(400, 101316), i18n.t)).toBe(
      'Kho đang ngừng hoạt động — không tạo được phiếu',
    )
  })

  it('lỗi khác → như errorMessage chung', () => {
    const e = new AxiosError('Network Error', AxiosError.ERR_NETWORK)
    expect(importFormErrorMessage(e, i18n.t)).toBe(errorMessage(e, i18n.t))
    expect(importFormErrorMessage(api(400, 101303), i18n.t)).toBe(
      errorMessage(api(400, 101303), i18n.t),
    )
  })
})

describe('isStaleImportFormError', () => {
  it.each([
    [409, 100800],
    [404, 101301],
    [400, 101314],
    [403, 101315],
  ])('HTTP %i / mã %i → phiếu đã đổi', (status, code) => {
    expect(isStaleImportFormError(api(status, code))).toBe(true)
  })

  it('lỗi khác → false', () => {
    expect(isStaleImportFormError(api(400, 101333))).toBe(false)
    expect(isStaleImportFormError(api(409))).toBe(false)
    expect(isStaleImportFormError(new Error('x'))).toBe(false)
    expect(isStaleImportFormError(null)).toBe(false)
  })
})

describe('isImportFormNotFoundError', () => {
  it('chỉ 101301 (phiếu không còn trên server)', () => {
    expect(isImportFormNotFoundError(api(404, 101301))).toBe(true)
    expect(isImportFormNotFoundError(api(409, 101314))).toBe(false)
    expect(isImportFormNotFoundError(api(404))).toBe(false)
    expect(isImportFormNotFoundError(new Error('x'))).toBe(false)
    expect(isImportFormNotFoundError(null)).toBe(false)
  })
})
