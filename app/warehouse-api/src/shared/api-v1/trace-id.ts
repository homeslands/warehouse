import { NIL as NIL_UUID, v4 as uuidv4, validate as uuidValidate } from 'uuid';

/**
 * TraceId do Gateway sinh/chuẩn hoá thành UUID (architecture R2 "Đường tin cậy" bước 4). Mọi RPC,
 * outbox và audit mang cùng traceId.
 *
 * Header client gửi lên chỉ được nhận nếu đúng là một UUID; mọi giá trị khác (chuỗi tự do, quá dài,
 * có ký tự điều khiển — nguy cơ log injection) bị bỏ và thay bằng UUID mới. NIL UUID cũng bị bỏ, vì nhiều
 * client gửi cùng giá trị đó sẽ làm trùng traceId. Luôn trả về chữ thường.
 */
export function isValidTraceId(value: unknown): value is string {
  return typeof value === 'string' && uuidValidate(value) && value !== NIL_UUID;
}

export function normalizeTraceId(incoming: unknown): string {
  if (typeof incoming === 'string') {
    const candidate = incoming.trim().toLowerCase();
    if (isValidTraceId(candidate)) return candidate;
  }
  return uuidv4();
}
