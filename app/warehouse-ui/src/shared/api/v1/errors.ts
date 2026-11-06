import type { V1Envelope, V1ErrorBody, V1FieldError } from './types'

/**
 * Lỗi nghiệp vụ/HTTP mà server trả ĐÚNG schema `Error` của OpenAPI v1. Phân loại bằng `errorKey`
 * (ổn định) — không bằng `message` (D07 §3: business error có code ổn định, traceId, field errors).
 */
export class ApiV1Error extends Error {
  readonly statusCode: number
  readonly code: number
  readonly errorKey: string
  readonly traceId: string
  readonly timestamp: string
  /** `errors[]` của server; rỗng khi server không gửi. */
  readonly fieldErrors: readonly V1FieldError[]

  constructor(body: V1ErrorBody) {
    super(body.message)
    this.name = 'ApiV1Error'
    this.statusCode = body.statusCode
    this.code = body.code
    this.errorKey = body.errorKey
    this.traceId = body.traceId
    this.timestamp = body.timestamp
    this.fieldErrors = body.errors ?? []
  }
}

/**
 * Response lệch hợp đồng v1 (thiếu `traceId`, body lỗi không phải schema `Error`, HTML của proxy…).
 * Tách khỏi `ApiV1Error` để không đoán `errorKey` từ thứ server không gửi.
 */
export class V1ProtocolError extends Error {
  /** HTTP status nếu có response; `undefined` khi chính body thành công sai hình dạng. */
  readonly status: number | undefined

  constructor(detail: string, status?: number) {
    super(detail)
    this.name = 'V1ProtocolError'
    this.status = status
  }
}

/** Không có response (mất mạng, hết giờ, CORS). Không phải lý do kết thúc phiên. */
export class V1NetworkError extends Error {
  constructor(detail: string) {
    super(detail)
    this.name = 'V1NetworkError'
  }
}

export function isApiV1Error(e: unknown): e is ApiV1Error {
  return e instanceof ApiV1Error
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function isFieldError(value: unknown): value is V1FieldError {
  return (
    isRecord(value) &&
    typeof value.field === 'string' &&
    typeof value.errorKey === 'string' &&
    typeof value.message === 'string'
  )
}

/**
 * Body thành công → `result`. Bắt buộc đủ field envelope, đặc biệt `traceId` (W02-BE-01 §1: envelope
 * v1 khác legacy đúng ở `traceId`). Thiếu là lỗi giao thức, không âm thầm nhận như legacy.
 */
export function parseV1Envelope<T>(body: unknown): V1Envelope<T> {
  if (!isRecord(body)) throw new V1ProtocolError('v1 envelope: body is not an object')
  const { message, statusCode, timestamp, traceId } = body
  if (typeof message !== 'string') throw new V1ProtocolError('v1 envelope: missing message')
  if (typeof statusCode !== 'number' || statusCode < 200 || statusCode > 299) {
    throw new V1ProtocolError('v1 envelope: statusCode is not 2xx')
  }
  if (!isNonEmptyString(timestamp)) throw new V1ProtocolError('v1 envelope: missing timestamp')
  if (!isNonEmptyString(traceId)) throw new V1ProtocolError('v1 envelope: missing traceId')
  if (!('result' in body)) throw new V1ProtocolError('v1 envelope: missing result')
  return { message, statusCode, timestamp, traceId, result: body.result as T }
}

/** Body lỗi + HTTP status → `ApiV1Error` nếu đúng schema `Error`, ngược lại `V1ProtocolError`. */
export function parseV1Error(status: number, body: unknown): ApiV1Error | V1ProtocolError {
  if (!isRecord(body)) return new V1ProtocolError('v1 error: body is not an object', status)
  const { statusCode, code, errorKey, message, traceId, timestamp, errors } = body
  const valid =
    typeof statusCode === 'number' &&
    typeof code === 'number' &&
    isNonEmptyString(errorKey) &&
    typeof message === 'string' &&
    isNonEmptyString(traceId) &&
    isNonEmptyString(timestamp) &&
    (errors === undefined || (Array.isArray(errors) && errors.every(isFieldError)))
  if (!valid) return new V1ProtocolError('v1 error: body is not schema Error', status)
  // HTTP status là nguồn sự thật cho luồng xử lý; body lệch status cũng là lệch hợp đồng.
  if (statusCode !== status) {
    return new V1ProtocolError(`v1 error: body statusCode ${statusCode} ≠ HTTP ${status}`, status)
  }
  return new ApiV1Error({
    statusCode,
    code,
    errorKey,
    message,
    traceId,
    timestamp,
    ...(errors === undefined ? {} : { errors: errors as V1FieldError[] }),
  })
}

/** HTTP status của một lỗi v1 bất kỳ (`undefined` = không có response). */
export function v1ErrorStatus(e: unknown): number | undefined {
  if (e instanceof ApiV1Error) return e.statusCode
  if (e instanceof V1ProtocolError) return e.status
  return undefined
}
