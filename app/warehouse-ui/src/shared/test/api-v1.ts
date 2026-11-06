import { HttpResponse } from 'msw'
import type {
  V1ActionResult,
  V1Envelope,
  V1ErrorBody,
  V1FieldError,
  V1LoginResult,
  V1User,
} from '@/shared/api/v1'

/**
 * MOCK cho test — dựng response ĐÚNG hình dạng OpenAPI v1 (`openapi-v1.json`, R2). API v1 chưa
 * chạy trên main (BE #197 còn draft): mọi test dùng file này là bằng chứng mock, không phải API thật.
 * `errorKey` dùng tên ở PR draft BE (#239/#240), chưa là hợp đồng.
 */

export const V1_BASE = 'http://localhost:8085/api/v1'

export const TRACE_ID = '00000000-0000-4000-8000-000000000001'
const TIMESTAMP = '2026-11-06T00:00:00.000Z'

export function v1ok<T>(result: T, statusCode = 200) {
  const body: V1Envelope<T> = {
    message: 'OK',
    statusCode,
    timestamp: TIMESTAMP,
    traceId: TRACE_ID,
    result,
  }
  return HttpResponse.json(body, { status: statusCode })
}

export function v1error(
  status: number,
  errorKey: string,
  {
    message = errorKey,
    code = status * 100,
    errors,
  }: { message?: string; code?: number; errors?: V1FieldError[] } = {},
) {
  const body: V1ErrorBody = {
    statusCode: status,
    code,
    errorKey,
    message,
    traceId: TRACE_ID,
    timestamp: TIMESTAMP,
    ...(errors ? { errors } : {}),
  }
  return HttpResponse.json(body, { status })
}

export function v1User(overrides: Partial<V1User> = {}): V1User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    phoneNumber: '0900000001',
    displayName: 'Nguyễn Văn A',
    email: 'a@example.test',
    isActive: true,
    role: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Supervisor',
      family: 'SUPERVISOR',
      level: 3,
      builtIn: true,
      authorityCodes: [],
      version: 1,
    },
    warehouseIds: [],
    version: 1,
    ...overrides,
  }
}

let counter = 0

/** `LoginResult` mock; mỗi lần gọi một access/CSRF mới (mô phỏng rotation). */
export function v1LoginResult(overrides: Partial<V1LoginResult> = {}): V1LoginResult {
  counter += 1
  return {
    accessToken: `access-${counter}`,
    expiresIn: 900,
    user: v1User(),
    sessionId: '33333333-3333-4333-8333-333333333333',
    csrfToken: `csrf-token-${String(counter).padStart(8, '0')}`,
    ...overrides,
  }
}

export function v1Action(status = 'OK'): V1ActionResult {
  return { id: '44444444-4444-4444-8444-444444444444', version: 1, status, traceId: TRACE_ID }
}
