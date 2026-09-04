import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from 'src/redis/redis.service';

export interface SessionMeta {
  ipAddress?: string;
  userAgent?: string;
}

/** Phiên đọc ra từ Redis, dùng cho GET /auth/sessions. */
export interface SessionRecord {
  sessionId: string;
  currentJti: string;
  createdAt: string;
  lastUsedAt: string;
  absoluteExpiresAt: string;
  ipAddress?: string;
  userAgent?: string;
}

/** Cặp (sid, jti) + hạn, đủ để AuthService ký ra cặp token. */
export interface IssuedSession {
  sessionId: string;
  jti: string;
  /** Số giây còn lại của refresh token — dùng làm `exp`. */
  ttlSeconds: number;
}

export type RotateOutcome =
  | ({ status: 'rotated' } & IssuedSession)
  | ({ status: 'grace' } & IssuedSession)
  | { status: 'reused' }
  | { status: 'revoked' }
  | { status: 'session_expired' }
  | { status: 'not_found' };

const TOKEN_PREFIX = 'REFRESH_TOKEN';
const SESSION_PREFIX = 'REFRESH_SESSION';
const INDEX_PREFIX = 'REFRESH_INDEX';

const DEFAULT_ABSOLUTE_DURATION = 7776000; // 90 ngày
const DEFAULT_GRACE_PERIOD = 10; // giây
const DEFAULT_MAX_ACTIVE_SESSIONS = 10;
const USER_AGENT_MAX_LENGTH = 512;

/**
 * Xoay vòng refresh token trong MỘT lệnh atomic.
 *
 * KEYS: [1] token cũ, [2] token mới, [3] session, [4] index
 * ARGV: [1] sid, [2] newJti, [3] graceTtl, [4] ttl, [5] sessionJson, [6] absoluteTtl
 *
 * Trả về: {'ROTATED'} | {'GRACE', <giá trị key cũ>} | {'MISS'}
 *
 * Token cũ KHÔNG bị xoá ngay mà chuyển sang trạng thái GRACE với TTL ngắn, để các
 * request refresh song song (mobile gọi từ nhiều luồng) không bị coi là reuse.
 */
const ROTATE_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then return {'MISS'} end
if string.sub(current, 1, 5) == 'GRACE' then return {'GRACE', current} end
redis.call('SETEX', KEYS[1], ARGV[3], 'GRACE:' .. ARGV[1] .. ':' .. ARGV[2])
redis.call('SETEX', KEYS[2], ARGV[4], 'ACTIVE:' .. ARGV[1])
redis.call('SETEX', KEYS[3], ARGV[4], ARGV[5])
redis.call('SADD', KEYS[4], ARGV[1])
redis.call('EXPIRE', KEYS[4], ARGV[6])
return {'ROTATED'}
`;

/**
 * Thu hồi 1 phiên: xoá session key + token key hiện tại của nó + gỡ khỏi index.
 *
 * KEYS: [1] session, [2] index
 * ARGV: [1] sid, [2] tiền tố token key (`REFRESH_TOKEN_{uid}_`)
 *
 * Trả về 1 nếu có phiên bị thu hồi, 0 nếu không có gì để thu hồi (idempotent).
 */
const REVOKE_SESSION_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
redis.call('SREM', KEYS[2], ARGV[1])
if not raw then return 0 end
local ok, session = pcall(cjson.decode, raw)
if ok and session and session['currentJti'] then
  redis.call('DEL', ARGV[2] .. session['currentJti'])
end
redis.call('DEL', KEYS[1])
return 1
`;

@Injectable()
export class RefreshTokenService {
  private readonly refreshableDuration: number;
  private readonly absoluteDuration: number;
  private readonly gracePeriod: number;
  private readonly maxActiveSessions: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {
    this.refreshableDuration = parseInt(this.configService.get('REFRESHABLE_DURATION'), 10);
    this.absoluteDuration = parseInt(
      this.configService.get('REFRESH_TOKEN_ABSOLUTE_DURATION') ?? `${DEFAULT_ABSOLUTE_DURATION}`,
      10,
    );
    this.gracePeriod = parseInt(
      this.configService.get('REFRESH_TOKEN_GRACE_PERIOD') ?? `${DEFAULT_GRACE_PERIOD}`,
      10,
    );
    this.maxActiveSessions = parseInt(
      this.configService.get('MAX_ACTIVE_SESSIONS') ?? `${DEFAULT_MAX_ACTIVE_SESSIONS}`,
      10,
    );
  }

  /** `jti` mang luôn thời điểm phát hành, phần random chống trùng khi 2 phiên sinh cùng mili giây. */
  private generateJti(now: Date): string {
    return `${now.getTime()}-${randomBytes(4).toString('hex')}`;
  }

  private tokenKey(userId: string, jti: string): string {
    return `${TOKEN_PREFIX}_${userId}_${jti}`;
  }

  private sessionKey(userId: string, sessionId: string): string {
    return `${SESSION_PREFIX}_${userId}_${sessionId}`;
  }

  private indexKey(userId: string): string {
    return `${INDEX_PREFIX}_${userId}`;
  }

  /** TTL của refresh token, luôn bị chặn bởi trần tuyệt đối của phiên. */
  private slidingTtl(absoluteExpiresAt: Date, now: Date): number {
    const remainingAbsolute = Math.floor((absoluteExpiresAt.getTime() - now.getTime()) / 1000);
    return Math.min(this.refreshableDuration, remainingAbsolute);
  }

  async createSession(
    userId: string,
    meta: SessionMeta,
    now: Date = new Date(),
  ): Promise<IssuedSession> {
    const client = this.redisService.getClient();
    const sessionId = uuidv4();
    const jti = this.generateJti(now);
    const absoluteExpiresAt = new Date(now.getTime() + this.absoluteDuration * 1000);
    const ttl = this.slidingTtl(absoluteExpiresAt, now);

    const session: SessionRecord = {
      sessionId,
      currentJti: jti,
      createdAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
      absoluteExpiresAt: absoluteExpiresAt.toISOString(),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent?.slice(0, USER_AGENT_MAX_LENGTH),
    };

    await client
      .multi()
      .setex(this.tokenKey(userId, jti), ttl, `ACTIVE:${sessionId}`)
      .setex(this.sessionKey(userId, sessionId), ttl, JSON.stringify(session))
      .sadd(this.indexKey(userId), sessionId)
      .expire(this.indexKey(userId), this.absoluteDuration)
      .exec();

    await this.enforceSessionLimit(userId, sessionId);

    return { sessionId, jti, ttlSeconds: ttl };
  }

  async rotate(
    userId: string,
    oldJti: string,
    sid: string | undefined,
    meta: SessionMeta,
    now: Date = new Date(),
  ): Promise<RotateOutcome> {
    const client = this.redisService.getClient();
    const context = `${RefreshTokenService.name}.${this.rotate.name}`;

    if (!sid) return { status: 'not_found' };

    const sessionKey = this.sessionKey(userId, sid);
    const raw = await client.get(sessionKey);
    if (!raw) {
      // Không còn phiên: đã logout, đã bị thu hồi, hoặc đã hết hạn.
      return { status: 'revoked' };
    }

    const session = JSON.parse(raw) as SessionRecord;
    const absoluteExpiresAt = new Date(session.absoluteExpiresAt);
    const newJti = this.generateJti(now);
    const ttl = this.slidingTtl(absoluteExpiresAt, now);
    if (ttl <= 0) {
      // Chạm trần tuyệt đối: phiên đã sống hết hạn cứng kể từ lúc login, buộc login lại.
      await this.revokeSession(userId, sid);
      return { status: 'session_expired' };
    }

    const nextSession: SessionRecord = {
      ...session,
      currentJti: newJti,
      lastUsedAt: now.toISOString(),
      ipAddress: meta.ipAddress ?? session.ipAddress,
      userAgent: meta.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? session.userAgent,
    };

    const result = (await client.eval(
      ROTATE_SCRIPT,
      4,
      this.tokenKey(userId, oldJti),
      this.tokenKey(userId, newJti),
      sessionKey,
      this.indexKey(userId),
      sid,
      newJti,
      `${this.gracePeriod}`,
      `${ttl}`,
      JSON.stringify(nextSession),
      `${this.absoluteDuration}`,
    )) as string[];

    if (result[0] === 'ROTATED') {
      return { status: 'rotated', sessionId: sid, jti: newJti, ttlSeconds: ttl };
    }

    if (result[0] === 'GRACE') {
      // `GRACE:{sid}:{jti}` — trả lại đúng token mà lần rotate trước đã phát, KHÔNG ghi gì thêm:
      // gia hạn ở đây sẽ biến cửa sổ grace thành vĩnh viễn nếu bị poll liên tục.
      const graceJti = result[1].split(':').slice(2).join(':');
      const graceTtl = await client.ttl(this.tokenKey(userId, graceJti));
      this.logger.warn(
        `Refresh token used within grace window session=${sid} ip=${meta.ipAddress}`,
        context,
      );
      if (graceTtl <= 0) return { status: 'not_found' };
      return { status: 'grace', sessionId: sid, jti: graceJti, ttlSeconds: graceTtl };
    }

    // MISS: token key không tồn tại nhưng phiên vẫn sống -> token đang trình ra là token cũ
    // của chính phiên này, tức đã bị dùng lại. Không giới hạn độ sâu: token cũ bao nhiêu vòng
    // trước cũng rơi vào nhánh này.
    await this.revokeSession(userId, sid);
    this.logger.warn(
      `Refresh token reuse detected, session revoked session=${sid} ip=${meta.ipAddress}`,
      context,
    );
    return { status: 'reused' };
  }

  async revokeSession(userId: string, sessionId: string): Promise<number> {
    const client = this.redisService.getClient();
    const revoked = (await client.eval(
      REVOKE_SESSION_SCRIPT,
      2,
      this.sessionKey(userId, sessionId),
      this.indexKey(userId),
      sessionId,
      `${TOKEN_PREFIX}_${userId}_`,
    )) as number;
    return revoked;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const client = this.redisService.getClient();
    const sessionIds = await client.smembers(this.indexKey(userId));
    let revoked = 0;
    for (const sessionId of sessionIds) {
      revoked += await this.revokeSession(userId, sessionId);
    }
    await client.del(this.indexKey(userId));
    return revoked;
  }

  /**
   * Phần tử của SET chỉ mục không tự hết hạn theo session key, nên vừa đọc vừa dọn lười:
   * sid nào không còn session key thì gỡ khỏi SET.
   */
  async listActiveSessions(userId: string): Promise<SessionRecord[]> {
    const client = this.redisService.getClient();
    const sessionIds = await client.smembers(this.indexKey(userId));
    if (sessionIds.length === 0) return [];

    const raws = await client.mget(sessionIds.map((id) => this.sessionKey(userId, id)));
    const sessions: SessionRecord[] = [];
    const staleIds: string[] = [];

    raws.forEach((raw, index) => {
      if (!raw) {
        staleIds.push(sessionIds[index]);
        return;
      }
      sessions.push(JSON.parse(raw) as SessionRecord);
    });

    if (staleIds.length > 0) await client.srem(this.indexKey(userId), ...staleIds);

    return sessions.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  }

  /** Giữ trần số phiên đồng thời, thu hồi phiên cũ nhất theo `lastUsedAt`. */
  private async enforceSessionLimit(userId: string, keepSessionId: string): Promise<void> {
    const sessions = await this.listActiveSessions(userId);
    if (sessions.length <= this.maxActiveSessions) return;

    const context = `${RefreshTokenService.name}.${this.enforceSessionLimit.name}`;
    const removable = sessions
      .filter((session) => session.sessionId !== keepSessionId)
      .sort((a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt))
      .slice(0, sessions.length - this.maxActiveSessions);

    for (const session of removable) {
      await this.revokeSession(userId, session.sessionId);
    }
    this.logger.log(
      `Revoked ${removable.length} oldest session(s) over the limit for user=${userId}`,
      context,
    );
  }
}
