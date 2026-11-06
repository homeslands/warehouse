import { RateLimiter } from './rate-limiter';
import { LOGIN_PHONE_NUMBER_FORMAT, LOGIN_RATE_LIMIT, RateLimitRule } from './session.constants';
import { SessionException } from './session.exception';
import { ClientInfo } from './session.policy';
import { SessionErrorCodeValue, SessionValidation } from './session.validation';

/**
 * Rate limit fail-closed: Redis lỗi ⇒ UNAVAILABLE (503), không cho qua (architecture: "UNAVAILABLE …
 * không fail-open"). Chỉ bắt lỗi hạ tầng của limiter; vượt hạn mức ⇒ `exceeded`.
 */
export async function enforceRateLimit(
  rateLimiter: RateLimiter,
  key: string,
  rule: RateLimitRule,
  exceeded: SessionErrorCodeValue,
): Promise<void> {
  let allowed: boolean;
  try {
    allowed = await rateLimiter.hit(key, rule);
  } catch {
    throw new SessionException(SessionValidation.SESSION_STORE_UNAVAILABLE);
  }
  if (!allowed) throw new SessionException(exceeded);
}

/**
 * Chặn trước khi login chạm DB (business-rules §21: 20 lần/phút theo IP + identifier):
 * - Review I-02a L1: không có IP hợp lệ thì không có bucket riêng cho client; 1 bucket chung sẽ cho bất kỳ
 *   ai khoá login của chủ tài khoản. Thiếu IP là lỗi hạ tầng Gateway ⇒ 503, không đoán.
 * - Review I-02a M2: identifier phải là ASCII đúng định dạng (`LOGIN_PHONE_NUMBER_FORMAT`) TRƯỚC khi làm key
 *   và tra DB. Collation `utf8mb4_0900_ai_ci` coi chữ số fullwidth/Arabic-Indic bằng ASCII ⇒ biến thể sẽ mở
 *   bucket mới cho cùng 1 user. Sai định dạng ⇒ không bao giờ chạm DB; đếm vào 1 bucket chung theo IP cho
 *   mọi chuỗi sai định dạng (chặn spam, không mở bucket theo biến thể) rồi trả 401 chung.
 */
export async function assertLoginAllowed(
  rateLimiter: RateLimiter,
  phoneNumber: string,
  info: ClientInfo,
): Promise<void> {
  if (!info.ip) throw new SessionException(SessionValidation.SESSION_CLIENT_IP_MISSING);
  const wellFormed = LOGIN_PHONE_NUMBER_FORMAT.test(phoneNumber);
  await enforceRateLimit(
    rateLimiter,
    wellFormed ? `login:${info.ip}:${phoneNumber}` : `login-malformed:${info.ip}`,
    LOGIN_RATE_LIMIT,
    SessionValidation.SESSION_LOGIN_RATE_LIMITED,
  );
  if (!wellFormed) throw new SessionException(SessionValidation.SESSION_INVALID_CREDENTIALS);
}
