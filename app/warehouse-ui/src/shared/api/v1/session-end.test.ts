import { describe, expect, it } from 'vitest'
import { ApiV1Error, V1NetworkError, V1ProtocolError } from './errors'
import {
  V1_INFRA_503_KEYS,
  V1_KEEP_SESSION_403_KEYS,
  V1_REFRESH_ONCE_KEYS,
  V1_SESSION_END_KEYS,
  isLockReason,
  sessionEndReasonForV1,
  terminalReasonFor,
} from './session-end'

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

describe('bảng errorKey theo trả lời BE Q1 (#197, đề xuất BE — chưa phải enum R2)', () => {
  it('khoá nội dung từng nhóm (đổi phải chủ động cập nhật test)', () => {
    expect(Object.fromEntries(V1_SESSION_END_KEYS)).toEqual({
      SESSION_REVOKED: 'revoked',
      SESSION_IDLE_EXPIRED: 'idle',
      SESSION_LOCKED: 'locked',
      SESSION_EXPIRED: 'expired',
      SESSION_USER_INACTIVE: 'userInactive',
      SESSION_REFRESH_TOKEN_INVALID: 'unauthorized',
      SESSION_REFRESH_TOKEN_REUSED: 'revoked',
      GATEWAY_REFRESH_COOKIE_MISSING: 'unauthorized',
      GATEWAY_REFRESH_COOKIE_CONFLICT: 'unauthorized',
    })
    expect([...V1_REFRESH_ONCE_KEYS].sort()).toEqual([
      'SESSION_ACCESS_TOKEN_EXPIRED',
      'SESSION_ACCESS_TOKEN_INVALID',
      'SESSION_ACCESS_TOKEN_MISSING',
    ])
    expect([...V1_KEEP_SESSION_403_KEYS].sort()).toEqual([
      'GATEWAY_CSRF_INVALID',
      'GATEWAY_ORIGIN_REJECTED',
      'RBAC_PERMISSION_DENIED',
    ])
    expect([...V1_INFRA_503_KEYS].sort()).toEqual([
      'GATEWAY_CLIENT_IP_UNAVAILABLE',
      'SESSION_CLIENT_IP_MISSING',
      'SESSION_STORE_UNAVAILABLE',
      'STORAGE_CALLER_IDENTITY_REJECTED',
    ])
  })
})

describe('sessionEndReasonForV1 — errorKey v1 → lý do kết thúc phiên', () => {
  it.each([...V1_SESSION_END_KEYS].map(([key, reason]) => [401, key, reason] as const))(
    '%i %s → %s (nhóm phiên đã chết)',
    (status, key, reason) => {
      expect(sessionEndReasonForV1(apiError(status, key))).toBe(reason)
    },
  )

  it.each([
    [403, 'SESSION_USER_INACTIVE', 'userInactive'],
    [401, 'SOMETHING_NEW', 'unauthorized'],
    // Khoá trùng tên prototype không được rơi vào thuộc tính của Object.
    [401, 'constructor', 'unauthorized'],
  ] as const)('%i %s → %s', (status, key, reason) => {
    expect(sessionEndReasonForV1(apiError(status, key))).toBe(reason)
  })

  it.each([...V1_KEEP_SESSION_403_KEYS, 'SOMETHING_NEW_403'])(
    '403 %s → null (403 không phải lỗi phiên, giữ phiên)',
    (key) => {
      expect(sessionEndReasonForV1(apiError(403, key))).toBeNull()
    },
  )

  it.each([...V1_INFRA_503_KEYS])('503 %s → null (hạ tầng, giữ phiên)', (key) => {
    expect(sessionEndReasonForV1(apiError(503, key))).toBeNull()
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

  it('body lệch hợp đồng: 401 → unauthorized, 403 → giữ phiên (không đoán từ message)', () => {
    expect(sessionEndReasonForV1(new V1ProtocolError('x', 401))).toBe('unauthorized')
    expect(sessionEndReasonForV1(new V1ProtocolError('x', 403))).toBeNull()
  })
})

describe('terminalReasonFor — 401 không cần thử refresh', () => {
  it('khoá terminal → lý do; khoá access token hết hạn/lạ → null (được refresh)', () => {
    expect(terminalReasonFor(apiError(401, 'SESSION_IDLE_EXPIRED'))).toBe('idle')
    expect(terminalReasonFor(apiError(401, 'SESSION_REVOKED'))).toBe('revoked')
    for (const key of V1_REFRESH_ONCE_KEYS) expect(terminalReasonFor(apiError(401, key))).toBeNull()
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
