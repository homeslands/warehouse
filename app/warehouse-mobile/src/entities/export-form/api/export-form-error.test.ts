import { AxiosError } from 'axios'

import i18n, { changeLanguage, initI18n } from '@/shared/i18n'
import { errorMessage } from '@/shared/api/error-message'

import {
  exportFormErrorMessage,
  isExportFormNotFoundError,
  isNotDraftError,
  isShortageError,
  isStaleExportFormError,
} from './export-form-error'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const api = (statusCode: number, code?: number, message = 'x') => ({
  statusCode,
  code,
  message,
  timestamp: '',
  path: '',
  method: 'POST',
})

describe('exportFormErrorMessage', () => {
  it.each([101418, 101410, 101417, 101415, 101416, 101437, 101438, 101432, 101425])(
    'mã %i → câu tiếng Việt riêng',
    (code) => {
      const msg = exportFormErrorMessage(api(400, code), i18n.t)
      expect(msg).not.toBe(i18n.t('errors:unknown'))
      expect(msg).not.toMatch(/^exportForms:/)
      expect(msg.length).toBeGreaterThan(5)
    },
  )

  it('101417 (kho đã tắt) → câu đọc được', () => {
    expect(exportFormErrorMessage(api(400, 101417), i18n.t)).toBe(
      'Kho đang ngừng hoạt động — không tạo được phiếu.',
    )
  })

  it('thiếu hàng (101502 / 100817) → cùng câu về tồn khả dụng', () => {
    const a = exportFormErrorMessage(api(409, 101502), i18n.t)
    expect(a).toBe(exportFormErrorMessage(api(409, 100817), i18n.t))
    expect(a).toMatch(/không đủ/i)
  })

  it('403 guard khi xác nhận phiếu xuất huỷ → câu về quyền duyệt xuất huỷ', () => {
    const e = api(403, undefined, 'Forbidden resource')
    expect(exportFormErrorMessage(e, i18n.t, { disposalConfirm: true })).toBe(
      i18n.t('exportForms:errors.approveDisposalDenied'),
    )
    expect(exportFormErrorMessage(e, i18n.t)).toBe(errorMessage(e, i18n.t))
  })

  it('mã lạ / lỗi mạng → như errorMessage chung', () => {
    const net = new AxiosError('Network Error', AxiosError.ERR_NETWORK)
    expect(exportFormErrorMessage(net, i18n.t)).toBe(errorMessage(net, i18n.t))
    expect(exportFormErrorMessage(null, i18n.t)).toBe(i18n.t('errors:unknown'))
  })
})

describe('isShortageError', () => {
  it('101502 và 100817 là thiếu hàng', () => {
    expect(isShortageError(api(409, 101502))).toBe(true)
    expect(isShortageError(api(409, 100817))).toBe(true)
  })
  it('khác → false', () => {
    expect(isShortageError(api(409, 101437))).toBe(false)
    expect(isShortageError(api(409))).toBe(false)
    expect(isShortageError(new Error('x'))).toBe(false)
    expect(isShortageError(null)).toBe(false)
  })
})

describe('isExportFormNotFoundError / isNotDraftError', () => {
  it('chỉ 101401 là không còn phiếu', () => {
    expect(isExportFormNotFoundError(api(404, 101401))).toBe(true)
    expect(isExportFormNotFoundError(api(404, 101426))).toBe(false)
    expect(isExportFormNotFoundError(null)).toBe(false)
  })
  it('chỉ 101415 là không còn Nháp', () => {
    expect(isNotDraftError(api(409, 101415))).toBe(true)
    expect(isNotDraftError(api(409, 101437))).toBe(false)
    expect(isNotDraftError(new Error('x'))).toBe(false)
  })
})

describe('isStaleExportFormError', () => {
  it.each([
    [409, 100800],
    [404, 101401],
    [409, 101415],
    [403, 101416],
    [409, 101437],
    [409, 101438],
  ])('HTTP %i / mã %i → phiếu đã đổi', (status, code) => {
    expect(isStaleExportFormError(api(status, code))).toBe(true)
  })

  it('thiếu hàng (cũng 409) KHÔNG phải phiếu đã đổi', () => {
    expect(isStaleExportFormError(api(409, 101502))).toBe(false)
    expect(isStaleExportFormError(api(409, 100817))).toBe(false)
  })

  it('lỗi khác → false', () => {
    expect(isStaleExportFormError(api(409))).toBe(false)
    expect(isStaleExportFormError(api(400, 101418))).toBe(false)
    expect(isStaleExportFormError(null)).toBe(false)
  })
})
