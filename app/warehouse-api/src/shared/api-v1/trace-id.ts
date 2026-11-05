import { v4 as uuidv4, validate as uuidValidate } from 'uuid';

/**
 * TraceId do Gateway sinh/chuẩn hoá thành UUID (architecture R2 "Đường tin cậy" bước 4). Mọi RPC,
 * outbox và audit mang cùng traceId.
 *
 * Header client gửi lên chỉ được nhận nếu đúng là một UUID; mọi giá trị khác (chuỗi tự do, quá dài,
 * có ký tự điều khiển — nguy cơ log injection) bị bỏ và thay bằng UUID mới. Luôn trả về chữ thường.
 */
export function normalizeTraceId(incoming: unknown): string {
  if (typeof incoming === 'string') {
    const candidate = incoming.trim();
    if (uuidValidate(candidate)) return candidate.toLowerCase();
  }
  return uuidv4();
}
