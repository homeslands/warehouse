import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/redis/redis.service';
import { BLACKLIST_PREFIX, IAT_AVAILABLE_PREFIX, REVOKED_FLAG_VALUE } from './auth.constants';

/**
 * Nơi duy nhất chạm Redis của auth. Mô hình **deny-list**: login/refresh không ghi gì, chỉ khi thu
 * hồi mới ghi — ngược hẳn với allow-list cũ ("key tồn tại ⇔ token còn hiệu lực"). Xem
 * `docs/specs/token-revocation.md`.
 *
 * 2 loại key, TTL của cả hai đều là `REFRESHABLE_DURATION`:
 * - `BLACK_LIST_{uid}_{sid}` — thu hồi 1 phiên (logout). Access và refresh token mang cùng `sid`
 *   nên 1 key giết cả cặp.
 * - `TOKEN_IAT_AVAILABLE_{uid}` — mốc epoch giây, mọi token có `iat` nhỏ hơn đều chết (logout-all;
 *   sau này đổi mật khẩu / xoá tài khoản gọi cùng hàm này).
 */
@Injectable()
export class TokenRevocationService {
  private readonly logger = new Logger(TokenRevocationService.name);

  /** Giây. TTL của cả 2 key — xem `ttl` trong `docs/specs/token-revocation.md`. */
  private readonly ttl: number;

  constructor(
    private readonly redisService: RedisService,
    configService: ConfigService,
  ) {
    this.ttl = parseInt(configService.get('REFRESHABLE_DURATION'), 10);
  }

  /**
   * Thu hồi 1 phiên (1 thiết bị). Cố ý **không** nuốt lỗi Redis: logout im lặng không có tác dụng
   * còn tệ hơn trả 5xx để client thử lại — thao tác này idempotent nên retry an toàn.
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.redisService
      .getClient()
      .set(this.blacklistKey(userId, sessionId), REVOKED_FLAG_VALUE, 'EX', this.ttl);
  }

  /**
   * Thu hồi MỌI token của user phát hành trước thời điểm này. Trả về mốc cutoff vừa ghi.
   *
   * Cutoff lấy đúng `now`, không phải `now + 1`: `iat` chỉ có độ phân giải 1 giây, nên `now + 1`
   * sẽ giết luôn token của lần login lại ngay trong giây đó (login trả 200 nhưng token 401 ngay).
   * Đánh đổi: token ký cùng giây với lần thu hồi này lọt qua — xem "Đánh đổi đã chấp nhận" trong
   * `docs/specs/token-revocation.md`.
   */
  async revokeAllTokensForUser(userId: string): Promise<number> {
    const cutoff = Math.floor(Date.now() / 1000);
    await this.redisService
      .getClient()
      .set(this.iatAvailableKey(userId), `${cutoff}`, 'EX', this.ttl);
    return cutoff;
  }

  /**
   * Check dùng chung cho `JwtStrategy.validate` (access token) và `AuthService.refresh` (refresh
   * token). Luôn **1 round-trip** Redis.
   *
   * **Fail-closed**: Redis lỗi ⇒ trả `true` (coi như đã thu hồi). Một cơ chế thu hồi mà chỉ cần
   * làm Redis chết là bypass được thì không phải cơ chế bảo mật. Đánh đổi có chủ ý: Redis chết =
   * mọi request có JWT đều 401.
   */
  async isRevoked(userId: string, sid?: string, iat?: number): Promise<boolean> {
    const client = this.redisService.getClient();
    const iatKey = this.iatAvailableKey(userId);

    try {
      // Token phát trước khi có claim `sid` không map được vào key blacklist — chỉ còn cutoff
      // chặn được nó.
      if (!sid) {
        return this.isBeforeCutoff(iat, await client.get(iatKey));
      }

      const [blacklisted, cutoff] = await client.mget(this.blacklistKey(userId, sid), iatKey);
      if (blacklisted) return true;
      return this.isBeforeCutoff(iat, cutoff);
    } catch (error) {
      this.logger.error(
        `Revocation check failed, denying request: ${error instanceof Error ? error.message : String(error)}`,
      );
      return true;
    }
  }

  private isBeforeCutoff(iat: number | undefined, cutoffRaw: string | null): boolean {
    if (!cutoffRaw || iat === undefined) return false;
    return iat < parseInt(cutoffRaw, 10);
  }

  private blacklistKey(userId: string, sessionId: string): string {
    return `${BLACKLIST_PREFIX}_${userId}_${sessionId}`;
  }

  private iatAvailableKey(userId: string): string {
    return `${IAT_AVAILABLE_PREFIX}_${userId}`;
  }
}
