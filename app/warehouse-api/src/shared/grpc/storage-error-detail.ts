import { V1FieldError } from '../api-v1/envelope';

/**
 * Chi tiết lỗi nghiệp vụ Storage → Gateway (architecture R2: "Business error details giữ mã/field/traceId
 * trong metadata gRPC đã được validate. Gateway không phân loại lỗi bằng regex trên message").
 *
 * Định dạng trên dây (DEV-197-03, R2 chưa chốt key/encoding):
 * - trailing metadata nhị phân `warehouse-error-bin`, đúng 1 giá trị;
 * - nội dung: JSON UTF-8 theo proto3 JSON mapping của message `warehouse.storage.v1.Error`
 *   (tên field theo `json_name`; int64 là chuỗi thập phân, nhận cả số nguyên khi decode).
 * Không dùng mã hoá protobuf nhị phân vì cần `protobufjs` làm dependency trực tiếp (ngoài phạm vi I-01b).
 *
 * HTTP status luôn suy từ gRPC status (`httpStatusForGrpc`); `statusCode` trong detail chỉ để đối chiếu.
 * `traceId`/`timestamp` trong detail bị bỏ qua: Gateway dùng traceId của chính request.
 */
export const STORAGE_ERROR_DETAIL_METADATA_KEY = 'warehouse-error-bin';

/** Giới hạn khi decode — detail sai/quá lớn bị bỏ hẳn (fail-closed về lỗi chung theo status). */
export const STORAGE_ERROR_DETAIL_LIMITS = {
  maxBytes: 16 * 1024,
  maxMessageLength: 500,
  maxFieldLength: 200,
  maxFieldErrors: 100,
} as const;

/** Mã lỗi dạng `UPPER_SNAKE` như `AppValidation` (vd `ROLE_VERSION_INVALID`), tối đa 128 ký tự. */
const ERROR_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;
/** Ký tự điều khiển (C0, DEL, C1) — chặn log/header injection qua message/field. */
// eslint-disable-next-line no-control-regex -- cố ý khớp ký tự điều khiển để loại bỏ input chứa chúng
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;
const INT64_STRING = /^-?\d{1,19}$/;

const ERROR_KEYS = new Set([
  'statusCode',
  'code',
  'errorKey',
  'message',
  'traceId',
  'timestamp',
  'errors',
]);
const FIELD_ERROR_KEYS = new Set(['field', 'errorKey', 'message']);

export interface StorageErrorDetail {
  /** HTTP status mà Storage kỳ vọng; nếu có phải trùng với bảng gRPC → HTTP. */
  statusCode?: number;
  code: number;
  errorKey: string;
  message?: string;
  errors: V1FieldError[];
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: JsonObject, allowed: ReadonlySet<string>): boolean =>
  Object.keys(value).every((key) => allowed.has(key));

const isSafeText = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= maxLength &&
  !CONTROL_CHARS.test(value);

const isErrorKey = (value: unknown): value is string =>
  typeof value === 'string' && ERROR_KEY_PATTERN.test(value);

/** int64 proto3 JSON: chuỗi thập phân hoặc số nguyên an toàn. */
function readInt64(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value !== 'string' || !INT64_STRING.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function readFieldError(value: unknown): V1FieldError | undefined {
  if (!isObject(value) || !hasOnlyKeys(value, FIELD_ERROR_KEYS)) return undefined;
  const { field, errorKey, message } = value;
  if (!isSafeText(field, STORAGE_ERROR_DETAIL_LIMITS.maxFieldLength)) return undefined;
  if (!isErrorKey(errorKey)) return undefined;
  if (!isSafeText(message, STORAGE_ERROR_DETAIL_LIMITS.maxMessageLength)) return undefined;
  return { field, errorKey, message };
}

function readFieldErrors(value: unknown): V1FieldError[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > STORAGE_ERROR_DETAIL_LIMITS.maxFieldErrors)
    return undefined;
  const parsed = value.map(readFieldError);
  return parsed.every((item) => item !== undefined) ? parsed : undefined;
}

function readOptionalStatusCode(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  const statusCode = readInt64(value);
  return statusCode !== undefined && statusCode >= 400 && statusCode <= 599 ? statusCode : null;
}

/**
 * Kiểm cấu trúc detail đã parse. Trả `undefined` nếu bất kỳ phần nào sai — không giữ lại từng phần,
 * để Gateway không trả code/errorKey lấy từ một detail hỏng.
 */
export function parseStorageErrorDetail(value: unknown): StorageErrorDetail | undefined {
  if (!isObject(value) || !hasOnlyKeys(value, ERROR_KEYS)) return undefined;
  const code = readInt64(value.code);
  if (code === undefined || code <= 0 || !isErrorKey(value.errorKey)) return undefined;
  const statusCode = readOptionalStatusCode(value.statusCode);
  if (statusCode === null) return undefined;
  const hasMessage = value.message !== undefined;
  if (hasMessage && !isSafeText(value.message, STORAGE_ERROR_DETAIL_LIMITS.maxMessageLength))
    return undefined;
  const errors = readFieldErrors(value.errors);
  if (!errors) return undefined;

  const detail: StorageErrorDetail = { code, errorKey: value.errorKey as string, errors };
  if (statusCode !== undefined) detail.statusCode = statusCode;
  if (hasMessage) detail.message = value.message as string;
  return detail;
}

/** Decode các giá trị của key `warehouse-error-bin` (từ `Metadata.get`). */
export function decodeStorageErrorDetail(
  values: ReadonlyArray<string | Buffer>,
): StorageErrorDetail | undefined {
  if (values.length !== 1) return undefined;
  const [raw] = values;
  if (!Buffer.isBuffer(raw) || raw.length === 0) return undefined;
  if (raw.length > STORAGE_ERROR_DETAIL_LIMITS.maxBytes) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    // Detail không phải JSON hợp lệ ⇒ coi như không có (Gateway dùng lỗi chung theo status).
    return undefined;
  }
  return parseStorageErrorDetail(parsed);
}

/**
 * Encode phía Storage. Validate trước khi gửi, để Storage không phát detail mà Gateway sẽ bỏ.
 * int64 ghi dạng chuỗi theo proto3 JSON mapping.
 */
export function encodeStorageErrorDetail(detail: StorageErrorDetail): Buffer {
  const wire: JsonObject = {
    code: String(detail.code),
    errorKey: detail.errorKey,
  };
  if (detail.statusCode !== undefined) wire.statusCode = String(detail.statusCode);
  if (detail.message !== undefined) wire.message = detail.message;
  if (detail.errors.length) wire.errors = detail.errors;
  if (!parseStorageErrorDetail(wire)) throw new RangeError('invalid Storage error detail');
  const encoded = Buffer.from(JSON.stringify(wire), 'utf8');
  if (encoded.length > STORAGE_ERROR_DETAIL_LIMITS.maxBytes)
    throw new RangeError('Storage error detail is too large');
  return encoded;
}
