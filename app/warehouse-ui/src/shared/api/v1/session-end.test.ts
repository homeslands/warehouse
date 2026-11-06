import { describe, expect, it } from 'vitest'
import { ApiV1Error, V1NetworkError, V1ProtocolError } from './errors'
import { isLockReason, sessionEndReasonForV1, terminalReasonFor } from './session-end'

function apiError(statusCode: number, errorKey: string) {
  return new ApiV1Error({
    statusCode,
    code: statusCode * 100,
    errorKey,
    message: errorKey,
    traceId: 't',
    timestamp: 't',
  })
}

describe('sessionEndReasonForV1 — errorKey v1 → lý do kết thúc phiên', () => {
  it.each([
    [401, 'SESSION_IDLE_EXPIRED', 'idle'],
    [401, 'SESSION_LOCKED', 'locked'],
    [401, 'SESSION_REVOKED', 'revoked'],
    [401, 'SESSION_REFRESH_TOKEN_REUSED', 'revoked'],
    [401, 'SESSION_USER_INACTIVE', 'userInactive'],
    [403, 'SESSION_USER_INACTIVE', 'userInactive'],
    [401, 'SESSION_EXPIRED', 'expired'],
    [401, 'SOMETHING_NEW', 'unauthorized'],
    [403, 'GATEWAY_CSRF_INVALID', 'unauthorized'],
    [403, 'GATEWAY_ORIGIN_REJECTED', 'unauthorized'],
    // Khoá trùng tên prototype không được rơi vào thuộc tính của Object.
    [401, 'constructor', 'unauthorized'],
  ])('%i %s → %s', (status, key, reason) => {
    expect(sessionEndReasonForV1(apiError(status, key))).toBe(reason)
  })

  it.each([
    ['429 rate limit refresh', apiError(429, 'SESSION_REFRESH_RATE_LIMITED')],
    ['503', apiError(503, 'SESSION_STORE_UNAVAILABLE')],
    ['500', apiError(500, 'GATEWAY_INTERNAL')],
    ['408', apiError(408, 'TIMEOUT')],
    ['mất mạng', new V1NetworkError('Network Error')],
    ['body lệch hợp đồng ở 502', new V1ProtocolError('html', 502)],
    ['lỗi lạ', new Error('boom')],
  ])('%s → null (lỗi tạm thời, giữ phiên)', (_, error) => {
    expect(sessionEndReasonForV1(error)).toBeNull()
  })

  it('body lệch hợp đồng ở 401/403 → unauthorized (không đoán từ message)', () => {
    expect(sessionEndReasonForV1(new V1ProtocolError('x', 401))).toBe('unauthorized')
    expect(sessionEndReasonForV1(new V1ProtocolError('x', 403))).toBe('unauthorized')
  })
})

describe('terminalReasonFor — 401 không cần thử refresh', () => {
  it('khoá terminal → lý do; khoá access token hết hạn/lạ → null (được refresh)', () => {
    expect(terminalReasonFor(apiError(401, 'SESSION_IDLE_EXPIRED'))).toBe('idle')
    expect(terminalReasonFor(apiError(401, 'SESSION_REVOKED'))).toBe('revoked')
    expect(terminalReasonFor(apiError(401, 'SESSION_ACCESS_TOKEN_EXPIRED'))).toBeNull()
    expect(terminalReasonFor(apiError(401, 'SESSION_ACCESS_TOKEN_INVALID'))).toBeNull()
    expect(terminalReasonFor(apiError(403, 'SESSION_REVOKED'))).toBeNull()
  })
})

describe('isLockReason', () => {
  it('chỉ idle/locked dẫn tới UI-02', () => {
    expect(isLockReason('idle')).toBe(true)
    expect(isLockReason('locked')).toBe(true)
    expect(isLockReason('expired')).toBe(false)
    expect(isLockReason(null)).toBe(false)
  })
})
