import { describe, expect, it } from 'vitest'
import { ApiV1Error, V1ProtocolError, parseV1Envelope, parseV1Error, v1ErrorStatus } from './errors'

const TRACE = '00000000-0000-4000-8000-000000000001'
const envelope = {
  message: 'OK',
  statusCode: 200,
  timestamp: '2026-11-06T00:00:00Z',
  traceId: TRACE,
}
const errorBody = {
  statusCode: 422,
  code: 42200,
  errorKey: 'GATEWAY_PAYLOAD_INVALID',
  message: 'Invalid',
  traceId: TRACE,
  timestamp: '2026-11-06T00:00:00Z',
}

describe('parseV1Envelope (envelope thành công v1)', () => {
  it('đủ field → trả envelope và result', () => {
    expect(parseV1Envelope({ ...envelope, result: { a: 1 } })).toEqual({
      ...envelope,
      result: { a: 1 },
    })
  })

  it('result = null vẫn hợp lệ (field có mặt)', () => {
    expect(parseV1Envelope({ ...envelope, result: null }).result).toBeNull()
  })

  it.each([
    ['thiếu traceId', { ...envelope, traceId: undefined, result: 1 }],
    ['traceId rỗng', { ...envelope, traceId: '', result: 1 }],
    ['thiếu result', { ...envelope }],
    ['statusCode không phải 2xx', { ...envelope, statusCode: 400, result: 1 }],
    ['thiếu timestamp', { ...envelope, timestamp: undefined, result: 1 }],
    [
      'envelope legacy (không traceId)',
      { message: 'ok', statusCode: 200, timestamp: 't', result: 1 },
    ],
    ['không phải object', 'OK'],
    ['mảng', []],
  ])('%s → V1ProtocolError', (_, body) => {
    expect(() => parseV1Envelope(body)).toThrow(V1ProtocolError)
  })
})

describe('parseV1Error (schema Error v1)', () => {
  it('đủ field → ApiV1Error có errorKey/code/traceId, fieldErrors rỗng khi không có errors[]', () => {
    const error = parseV1Error(422, errorBody)
    expect(error).toBeInstanceOf(ApiV1Error)
    expect(error).toMatchObject({
      statusCode: 422,
      code: 42200,
      errorKey: 'GATEWAY_PAYLOAD_INVALID',
      message: 'Invalid',
      traceId: TRACE,
      fieldErrors: [],
    })
  })

  it('errors[] (field/errorKey/message) được giữ nguyên thứ tự', () => {
    const errors = [
      { field: 'password', errorKey: 'TOO_LONG', message: 'max 128' },
      { field: 'phoneNumber', errorKey: 'REQUIRED', message: 'required' },
    ]
    const error = parseV1Error(422, { ...errorBody, errors })
    expect(error).toBeInstanceOf(ApiV1Error)
    expect((error as ApiV1Error).fieldErrors).toEqual(errors)
  })

  it.each([
    ['thiếu errorKey', { ...errorBody, errorKey: undefined }],
    ['thiếu traceId', { ...errorBody, traceId: undefined }],
    ['code không phải số', { ...errorBody, code: 'X' }],
    ['errors[] thiếu errorKey', { ...errorBody, errors: [{ field: 'a', message: 'b' }] }],
    [
      'body legacy (code số, không errorKey)',
      { statusCode: 422, code: 100001, message: 'x', timestamp: 't', path: '/', method: 'POST' },
    ],
    ['HTML của proxy', '<html>502</html>'],
    ['statusCode trong body lệch HTTP status', { ...errorBody, statusCode: 400 }],
  ])('%s → V1ProtocolError giữ HTTP status, không đoán errorKey', (_, body) => {
    const error = parseV1Error(422, body)
    expect(error).toBeInstanceOf(V1ProtocolError)
    expect(v1ErrorStatus(error)).toBe(422)
  })
})
