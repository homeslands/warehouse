/**
 * Envelope `/api/v1` theo OpenAPI R2 (W02-BE-01 mục 1):
 * - Thành công: required `message`, `statusCode` (2xx), `timestamp`, `traceId`, `result`.
 * - Lỗi (`Error`): required `statusCode`, `code`, `errorKey`, `message`, `traceId`, `timestamp`;
 *   `errors` (mảng `FieldError`) tuỳ chọn — đúng tên field trong OpenAPI/proto R2.
 * Legacy `AppResponseDto` (không có `traceId`) giữ nguyên cho route cũ; không dùng chung type.
 */
export interface V1SuccessEnvelope<T> {
  message: string;
  statusCode: number;
  timestamp: string;
  traceId: string;
  result: T;
}

export interface V1FieldError {
  field?: string;
  errorKey?: string;
  message?: string;
}

export interface V1ErrorEnvelope {
  statusCode: number;
  code: number;
  errorKey: string;
  message: string;
  traceId: string;
  timestamp: string;
  errors?: V1FieldError[];
}

export function v1Success<T>(
  result: T,
  traceId: string,
  message: string,
  statusCode = 200,
  now: Date = new Date(),
): V1SuccessEnvelope<T> {
  if (statusCode < 200 || statusCode > 299)
    throw new RangeError(`success envelope needs a 2xx statusCode, got ${statusCode}`);
  return { message, statusCode, timestamp: now.toISOString(), traceId, result };
}

export function v1Error(
  input: Omit<V1ErrorEnvelope, 'timestamp'>,
  now: Date = new Date(),
): V1ErrorEnvelope {
  if (input.statusCode < 400 || input.statusCode > 599)
    throw new RangeError(`error envelope needs a 4xx/5xx statusCode, got ${input.statusCode}`);
  const envelope: V1ErrorEnvelope = {
    statusCode: input.statusCode,
    code: input.code,
    errorKey: input.errorKey,
    message: input.message,
    traceId: input.traceId,
    timestamp: now.toISOString(),
  };
  if (input.errors?.length) envelope.errors = input.errors;
  return envelope;
}
