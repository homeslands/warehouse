import { createHash } from 'crypto';
import Redis from 'ioredis';
import { RateLimitRule } from './session.constants';

/**
 * Bộ đếm rate limit cửa sổ cố định. `hit` tăng bộ đếm của `key` và trả `true` nếu còn trong hạn mức.
 * Lỗi hạ tầng phải ném ra (caller fail-closed ⇒ UNAVAILABLE), không được trả `true` (R2: không fail-open).
 */
export interface RateLimiter {
  hit(key: string, rule: RateLimitRule): Promise<boolean>;
}

/**
 * INCR + PEXPIRE nguyên tử bằng Lua: lần đầu trong cửa sổ đặt TTL; key không bao giờ thiếu TTL (kể cả khi
 * TTL mất do sự cố, script đặt lại). Không chạy SCAN/KEYS.
 */
const FIXED_WINDOW_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 or redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return current
`;

export class RedisFixedWindowRateLimiter implements RateLimiter {
  /**
   * @param prefix tiền tố namespace key (vd `wh:v1:rl:`); key thật = prefix + phần đã băm, để identifier
   * (số điện thoại) và IP không nằm dạng rõ trong Redis.
   */
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
  ) {
    if (!prefix) throw new RangeError('rate limit key prefix is required');
  }

  async hit(key: string, rule: RateLimitRule): Promise<boolean> {
    const redisKey = `${this.prefix}${createHash('sha256').update(key, 'utf8').digest('hex')}`;
    const count = await this.redis.eval(FIXED_WINDOW_SCRIPT, 1, redisKey, String(rule.windowMs));
    return Number(count) <= rule.limit;
  }
}
