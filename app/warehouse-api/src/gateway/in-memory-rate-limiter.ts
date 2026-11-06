import { RateLimitRule } from 'src/session/session.constants';
import { RateLimiter } from 'src/session/rate-limiter';
import { Clock, systemClock } from 'src/session/session.policy';

interface Window {
  startedAt: number;
  count: number;
}

/** Trần số key giữ trong bộ nhớ: quá trần ⇒ dọn cửa sổ đã hết hạn, vẫn quá ⇒ từ chối (fail-closed). */
const DEFAULT_MAX_KEYS = 100_000;

/**
 * Rate limit cửa sổ cố định trong bộ nhớ của 1 process Gateway (I-02b: throttle refresh theo IP). Gateway
 * không có Redis/DB nghiệp vụ (architecture); bảo vệ chính vẫn là throttle 30/phút/phiên ở Storage (Redis).
 * Nhiều instance Gateway ⇒ mỗi instance đếm riêng (giới hạn hiệu dụng = N × limit) — ghi ở DEV-197-16.
 */
export class InMemoryFixedWindowRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly clock: Clock = systemClock,
    private readonly maxKeys = DEFAULT_MAX_KEYS,
  ) {}

  async hit(key: string, rule: RateLimitRule): Promise<boolean> {
    const now = this.clock.now().getTime();
    const current = this.windows.get(key);
    if (current && now - current.startedAt < rule.windowMs) {
      current.count += 1;
      return current.count <= rule.limit;
    }
    if (!current && this.windows.size >= this.maxKeys) this.evictExpired(now, rule.windowMs);
    if (!current && this.windows.size >= this.maxKeys) return false;
    this.windows.set(key, { startedAt: now, count: 1 });
    return rule.limit >= 1;
  }

  private evictExpired(now: number, windowMs: number): void {
    for (const [key, window] of this.windows)
      if (now - window.startedAt >= windowMs) this.windows.delete(key);
  }
}
