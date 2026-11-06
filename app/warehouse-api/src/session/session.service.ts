import * as bcrypt from 'bcrypt';
import { DataSource, EntityManager, Equal, IsNull, MoreThan } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { User } from 'src/user/user.entity';
import { AccessTokenService, IssuedAccessToken } from './access-token.service';
import { RateLimiter } from './rate-limiter';
import { RefreshTokenFamily, RefreshTokenHash } from './refresh-token.entity';
import {
  ACTIVITY_RATE_LIMIT,
  CHANGE_PASSWORD_RATE_LIMIT,
  RateLimitRule,
  REFRESH_RATE_LIMIT,
  SESSION_MAX_LIFETIME_MS,
  SessionActionStatus,
  SessionRevokeReason,
} from './session.constants';
import { AuthSession } from './session.entity';
import { SessionException } from './session.exception';
import { assertLoginAllowed, enforceRateLimit } from './session.throttle';
import {
  insertCurrentHash,
  LOCK,
  lockOwnSession,
  lockUserSessions,
  revokeSession,
  SessionPrincipal,
} from './session.store';

export type { SessionPrincipal } from './session.store';
import {
  ClientInfo,
  Clock,
  decideRefresh,
  fieldError,
  generateRefreshToken,
  hashRefreshToken,
  isWellFormedRefreshToken,
  nextIdleExpiry,
  normalizeClientInfo,
  sessionUnusableReason,
} from './session.policy';
import { LoginInput, PasswordChangeInput, SessionListQuery } from './session.request';
import {
  SessionErrorCodeValue,
  SessionFieldErrorKey,
  SessionValidation,
} from './session.validation';

export interface IssuedSession {
  accessToken: IssuedAccessToken;
  /** Plaintext — chỉ trả cho Gateway để đặt cookie; không lưu, không log. */
  refreshToken: string;
  session: AuthSession;
  user: User;
}

export interface SessionActionOutcome {
  id: string;
  version: number;
  status: SessionActionStatus;
}

export interface SessionPage {
  items: AuthSession[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionServiceOptions {
  dataSource: DataSource;
  tokens: AccessTokenService;
  rateLimiter: RateLimiter;
  clock: Clock;
  /** bcrypt cost cho mật khẩu mới (cùng `SALT_ROUNDS` của legacy). */
  saltRounds: number;
}

/** Chế độ xác thực: `strict` = phiên phải còn dùng được; `revocation` = chỉ cần JWT hợp lệ + phiên của user. */
export type AuthenticationMode = 'strict' | 'revocation';

/** bcrypt chấp nhận cost 4..31; dưới 4 thì `bcrypt.hash` lỗi. */
const BCRYPT_MIN_SALT_ROUNDS = 4;
const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;
/** User đặc biệt của legacy không được đăng nhập (giữ như `AuthService.validateUser`). */
const NON_LOGIN_PHONENUMBER = 'default-customer';

type RefreshOutcome =
  | { kind: 'rotated'; session: AuthSession; user: User; refreshToken: string }
  | { kind: 'reused' }
  | { kind: 'rejected'; error: SessionErrorCodeValue };

/**
 * Phiên đăng nhập v1 phía Storage (W02 I-02; business-rules §16, §20-21; D14; #196 mục 5a).
 *
 * - Login: throttle IP+identifier (20/phút) trước khi đọc DB; lỗi đăng nhập luôn 1 mã chung (không lộ tài
 *   khoản tồn tại, so bcrypt với hash giả khi không có user); tạo phiên + family + hash trong 1 transaction.
 * - Refresh: throttle 30/phút/phiên; transaction khoá phiên → family → hash; hash cũ dùng lại ⇒ revoke
 *   family + phiên rồi COMMIT, sau đó mới trả 401; rotation không gia hạn idle.
 * - Idle 30 phút do server; chỉ `recordActivity` (có rate limit) đẩy lùi.
 * - Mọi mốc thời gian từ `Clock` inject.
 */
export class SessionService {
  private readonly dataSource: DataSource;
  private readonly tokens: AccessTokenService;
  private readonly rateLimiter: RateLimiter;
  private readonly clock: Clock;
  private readonly saltRounds: number;
  private dummyHash?: Promise<string>;

  constructor(options: SessionServiceOptions) {
    if (!Number.isSafeInteger(options.saltRounds) || options.saltRounds < BCRYPT_MIN_SALT_ROUNDS)
      throw new RangeError('saltRounds must be an integer >= 4');
    this.dataSource = options.dataSource;
    this.tokens = options.tokens;
    this.rateLimiter = options.rateLimiter;
    this.clock = options.clock;
    this.saltRounds = options.saltRounds;
  }

  // ---------------------------------------------------------------- login / refresh

  async login(input: LoginInput, client: ClientInfo): Promise<IssuedSession> {
    const info = normalizeClientInfo(client);
    await assertLoginAllowed(this.rateLimiter, input.phoneNumber, info);

    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { phonenumber: Equal(input.phoneNumber) } });
    const candidate = user && user.phonenumber !== NON_LOGIN_PHONENUMBER ? user : null;
    // Luôn chạy bcrypt (hash giả khi không có user) để thời gian phản hồi không lộ tài khoản tồn tại.
    const matches = await bcrypt.compare(
      input.password,
      candidate?.password ?? (await this.fakeHash()),
    );
    // User bị khoá cũng nhận lỗi chung: báo "bị khoá" sẽ xác nhận tài khoản + mật khẩu đúng.
    if (!candidate || !matches || !candidate.isActive)
      throw new SessionException(SessionValidation.SESSION_INVALID_CREDENTIALS);

    const refreshToken = generateRefreshToken();
    const session = await this.dataSource.transaction(async (manager) => {
      const now = this.clock.now();
      const expiresAt = new Date(now.getTime() + SESSION_MAX_LIFETIME_MS);
      const created = manager.create(AuthSession, {
        id: uuidv4(),
        userId: candidate.id,
        createdAt: now,
        version: 1,
        lastInteractiveAt: now,
        idleExpiresAt: nextIdleExpiry(now, expiresAt),
        expiresAt,
        lockedAt: null,
        revokedAt: null,
        revokeReason: null,
        ipAddress: info.ip ?? null,
        userAgent: info.userAgent ?? null,
      });
      await manager.insert(AuthSession, created);
      const family = manager.create(RefreshTokenFamily, {
        id: uuidv4(),
        sessionId: created.id,
        createdAt: now,
        version: 1,
        revokedAt: null,
        revokeReason: null,
      });
      await manager.insert(RefreshTokenFamily, family);
      await insertCurrentHash(manager, family.id, refreshToken, now, expiresAt);
      return created;
    });

    return {
      accessToken: this.tokens.sign({ sub: candidate.id, sid: session.id }),
      refreshToken,
      session,
      user: candidate,
    };
  }

  async refresh(refreshToken: unknown): Promise<IssuedSession> {
    if (!isWellFormedRefreshToken(refreshToken))
      throw new SessionException(SessionValidation.SESSION_REFRESH_TOKEN_INVALID);
    const located = await this.dataSource.getRepository(RefreshTokenHash).findOne({
      where: { tokenHash: Equal(hashRefreshToken(refreshToken)) },
      relations: { family: true },
    });
    if (!located?.family)
      throw new SessionException(SessionValidation.SESSION_REFRESH_TOKEN_INVALID);
    // Đếm cả lần refresh lỗi: lạm dụng vẫn không tạo được token (business-rules §21).
    const { sessionId } = located.family;
    await this.enforceRateLimit(
      `refresh:${sessionId}`,
      REFRESH_RATE_LIMIT,
      SessionValidation.SESSION_REFRESH_RATE_LIMITED,
    );

    const outcome = await this.dataSource.transaction((manager) =>
      this.rotate(manager, located.id, located.familyId, sessionId),
    );
    if (outcome.kind === 'reused')
      throw new SessionException(SessionValidation.SESSION_REFRESH_TOKEN_REUSED);
    if (outcome.kind === 'rejected') throw new SessionException(outcome.error);
    return {
      accessToken: this.tokens.sign({ sub: outcome.user.id, sid: outcome.session.id }),
      refreshToken: outcome.refreshToken,
      session: outcome.session,
      user: outcome.user,
    };
  }

  /**
   * Trả kết quả thay vì ném lỗi trong callback: nhánh reuse phải COMMIT việc revoke trước khi trả 401
   * (ném lỗi sẽ rollback mất revoke). Các nhánh từ chối khác không ghi gì.
   */
  private async rotate(
    manager: EntityManager,
    hashId: string,
    familyId: string,
    sessionId: string,
  ): Promise<RefreshOutcome> {
    const now = this.clock.now();
    // Thứ tự khoá cố định phiên → family → hash (giống login/logout) để tránh deadlock.
    const session = await manager.findOne(AuthSession, {
      where: { id: Equal(sessionId) },
      lock: LOCK,
    });
    const family = await manager.findOne(RefreshTokenFamily, {
      where: { id: Equal(familyId) },
      lock: LOCK,
    });
    const hash = await manager.findOne(RefreshTokenHash, {
      where: { id: Equal(hashId) },
      lock: LOCK,
    });
    if (!session || !family || !hash)
      return { kind: 'rejected', error: SessionValidation.SESSION_REFRESH_TOKEN_INVALID };

    // Đọc lại trên bản đã khoá: 2 refresh song song cùng token ⇒ request sau thấy token đã dùng ⇒ reuse.
    const user = await manager.findOne(User, { where: { id: Equal(session.userId) } });
    const decision = decideRefresh({ session, family, hash, userActive: !!user?.isActive }, now);
    if (decision.action === 'revoke-reuse') {
      if (!session.revokedAt)
        await revokeSession(manager, session, SessionRevokeReason.RefreshTokenReuse, now);
      return { kind: 'reused' };
    }
    if (decision.action === 'reject' || !user)
      return {
        kind: 'rejected',
        error:
          decision.action === 'reject' ? decision.error : SessionValidation.SESSION_USER_INACTIVE,
      };

    // Bỏ cờ hiện hành của hash cũ TRƯỚC khi chèn hash mới (unique 1 token hiện hành / family).
    await manager.update(
      RefreshTokenHash,
      { id: Equal(hash.id) },
      { usedAt: now, currentFamilyId: null },
    );
    const next = generateRefreshToken();
    await insertCurrentHash(manager, family.id, next, now, session.expiresAt);
    await manager.update(
      RefreshTokenFamily,
      { id: Equal(family.id) },
      { version: family.version + 1 },
    );
    // Không đụng lastInteractiveAt/idleExpiresAt: refresh không gia hạn idle (business-rules §20).
    return { kind: 'rotated', session, user, refreshToken: next };
  }

  // ---------------------------------------------------------------- xác thực RPC

  /**
   * Storage tự kiểm JWT trong metadata `authorization` (architecture "Đường tin cậy" bước 3): chữ ký/iss/aud/
   * exp/typ, phiên tồn tại và thuộc đúng `sub`. `strict`: phiên chưa revoked/locked/idle/expired và user còn
   * active. `revocation` (CHỈ logout): bỏ qua trạng thái phiên để logout lặp lại cho cùng kết quả — logout chỉ
   * chạm chính phiên của token, không bao giờ phiên khác (review I-02a M1).
   */
  async authenticate(
    authorization: string | undefined,
    mode: AuthenticationMode = 'strict',
  ): Promise<SessionPrincipal> {
    if (!authorization) throw new SessionException(SessionValidation.SESSION_ACCESS_TOKEN_MISSING);
    const match = BEARER.exec(authorization);
    if (!match) throw new SessionException(SessionValidation.SESSION_ACCESS_TOKEN_INVALID);
    const claims = this.tokens.verify(match[1]);

    const session = await this.dataSource
      .getRepository(AuthSession)
      .findOne({ where: { id: Equal(claims.sid) }, relations: { user: true } });
    if (!session || session.userId !== claims.sub)
      throw new SessionException(SessionValidation.SESSION_ACCESS_TOKEN_INVALID);
    if (mode === 'strict') {
      const unusable = sessionUnusableReason(session, this.clock.now());
      if (unusable) throw new SessionException(unusable);
      if (!session.user?.isActive || session.user.deletedAt)
        throw new SessionException(SessionValidation.SESSION_USER_INACTIVE);
    }
    return { userId: session.userId, sessionId: session.id };
  }

  // ---------------------------------------------------------------- thao tác trên phiên

  /** Thu hồi phiên hiện tại. Lặp lại trên phiên đã thu hồi ⇒ cùng kết quả, không ghi thêm. */
  async logout(principal: SessionPrincipal): Promise<SessionActionOutcome> {
    return this.dataSource.transaction(async (manager) => {
      const session = await lockOwnSession(manager, principal, principal.sessionId);
      if (!session.revokedAt)
        await revokeSession(manager, session, SessionRevokeReason.Logout, this.clock.now());
      return this.outcome(session, SessionActionStatus.Revoked);
    });
  }

  /** Thu hồi mọi phiên còn hiệu lực của user (kể cả phiên hiện tại) — TC-AUTH-06. */
  async logoutAll(principal: SessionPrincipal): Promise<SessionActionOutcome> {
    return this.dataSource.transaction(async (manager) => {
      const now = this.clock.now();
      const { current, sessions } = await lockUserSessions(manager, principal);
      // Review I-02a M1: chỉ phiên còn dùng được mới thu hồi được phiên KHÁC. Access JWT (≤15') của phiên đã
      // thu hồi/khoá/idle không được đá phiên mới của user. Kiểm lại trên bản đã khoá (đã kiểm ở authenticate).
      const unusable = sessionUnusableReason(current, now);
      if (unusable) throw new SessionException(unusable);
      for (const session of sessions)
        if (!session.revokedAt)
          await revokeSession(manager, session, SessionRevokeReason.LogoutAll, now);
      return this.outcome(current, SessionActionStatus.Revoked);
    });
  }

  /**
   * Khoá phiên hiện tại (UI-02). Phiên khoá không dùng/refresh được nữa. Chỉ phiên còn dùng được mới khoá
   * được (review I-02a M1); khoá lần 2 ⇒ 401 `SESSION_LOCKED`.
   */
  async lock(principal: SessionPrincipal): Promise<SessionActionOutcome> {
    return this.dataSource.transaction(async (manager) => {
      const now = this.clock.now();
      const session = await lockOwnSession(manager, principal, principal.sessionId);
      const unusable = sessionUnusableReason(session, now);
      if (unusable) throw new SessionException(unusable);
      session.lockedAt = now;
      session.version += 1;
      await manager.update(
        AuthSession,
        { id: Equal(session.id) },
        { lockedAt: session.lockedAt, version: session.version },
      );
      return this.outcome(session, SessionActionStatus.Locked);
    });
  }

  /**
   * Hoạt động tương tác thật của người dùng — cách DUY NHẤT gia hạn idle (refresh/polling không gia hạn).
   * Rate limit theo phiên; phiên đã idle/khoá/thu hồi không được "hồi sinh".
   */
  async recordActivity(principal: SessionPrincipal): Promise<SessionActionOutcome> {
    await this.enforceRateLimit(
      `activity:${principal.sessionId}`,
      ACTIVITY_RATE_LIMIT,
      SessionValidation.SESSION_ACTIVITY_RATE_LIMITED,
    );
    return this.dataSource.transaction(async (manager) => {
      const now = this.clock.now();
      const session = await lockOwnSession(manager, principal, principal.sessionId);
      const unusable = sessionUnusableReason(session, now);
      if (unusable) throw new SessionException(unusable);
      session.lastInteractiveAt = now;
      session.idleExpiresAt = nextIdleExpiry(now, session.expiresAt);
      session.version += 1;
      await manager.update(
        AuthSession,
        { id: Equal(session.id) },
        {
          lastInteractiveAt: session.lastInteractiveAt,
          idleExpiresAt: session.idleExpiresAt,
          version: session.version,
        },
      );
      return this.outcome(session, SessionActionStatus.ActivityRecorded);
    });
  }

  /** Phiên còn dùng được của chính user (chưa thu hồi/khoá/idle/hết hạn), có phân trang. */
  async listOwnSessions(
    principal: SessionPrincipal,
    query: SessionListQuery,
  ): Promise<SessionPage> {
    const now = this.clock.now();
    const [items, total] = await this.dataSource.getRepository(AuthSession).findAndCount({
      where: {
        userId: Equal(principal.userId),
        revokedAt: IsNull(),
        lockedAt: IsNull(),
        idleExpiresAt: MoreThan(now),
        expiresAt: MoreThan(now),
      },
      order: { createdAt: query.sort, id: 'ASC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Thu hồi 1 phiên của chính mình. Phiên của user khác ⇒ 404 như không tồn tại (che existence). */
  async revokeOwnSession(
    principal: SessionPrincipal,
    sessionId: string,
  ): Promise<SessionActionOutcome> {
    return this.dataSource.transaction(async (manager) => {
      const session = await lockOwnSession(manager, principal, sessionId, true);
      if (!session.revokedAt)
        await revokeSession(manager, session, SessionRevokeReason.UserRevoked, this.clock.now());
      return this.outcome(session, SessionActionStatus.Revoked);
    });
  }

  /**
   * Đổi mật khẩu của chính mình (OpenAPI: "revoke sessions khác"). So mật khẩu hiện tại trước transaction
   * (bcrypt chậm, không giữ khoá); trong transaction khoá user và kiểm hash chưa bị đổi bởi request khác
   * kể từ lúc so, rồi ghi hash mới + thu hồi các phiên khác cùng lúc. Phiên hiện tại giữ nguyên.
   *
   * Ghi thẳng `user_tbl.password_column` bằng `manager` (lệch BE-ARCH-02: `UserService.updatePassword`
   * không nhận `manager` và `src/user/` ngoài ownership I-02) — DEV-197-09.
   */
  async changeOwnPassword(
    principal: SessionPrincipal,
    input: PasswordChangeInput,
  ): Promise<SessionActionOutcome> {
    // Review I-02a L2: giới hạn số lần thử mật khẩu hiện tại theo user (DEV-197-13, con số tạm).
    await this.enforceRateLimit(
      `change-password:${principal.userId}`,
      CHANGE_PASSWORD_RATE_LIMIT,
      SessionValidation.SESSION_CHANGE_PASSWORD_RATE_LIMITED,
    );
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: Equal(principal.userId) } });
    if (!user) throw new SessionException(SessionValidation.SESSION_USER_INACTIVE);
    if (!(await bcrypt.compare(input.currentPassword, user.password))) throw incorrectPassword();
    const verifiedHash = user.password;
    const newHash = await bcrypt.hash(input.newPassword, this.saltRounds);

    return this.dataSource.transaction(async (manager) => {
      const now = this.clock.now();
      const locked = await manager.findOne(User, {
        where: { id: Equal(principal.userId) },
        lock: LOCK,
      });
      if (!locked?.isActive) throw new SessionException(SessionValidation.SESSION_USER_INACTIVE);
      if (locked.password !== verifiedHash) throw incorrectPassword();
      const { current, sessions } = await lockUserSessions(manager, principal);
      const unusable = sessionUnusableReason(current, now);
      if (unusable) throw new SessionException(unusable);

      await manager.update(User, { id: Equal(locked.id) }, { password: newHash });
      for (const session of sessions)
        if (session.id !== current.id && !session.revokedAt)
          await revokeSession(manager, session, SessionRevokeReason.PasswordChanged, now);
      return this.outcome(current, SessionActionStatus.PasswordChanged);
    });
  }

  // ---------------------------------------------------------------- helpers
  private outcome(session: AuthSession, status: SessionActionStatus): SessionActionOutcome {
    return { id: session.id, version: session.version, status };
  }

  private enforceRateLimit(
    key: string,
    rule: RateLimitRule,
    exceeded: SessionErrorCodeValue,
  ): Promise<void> {
    return enforceRateLimit(this.rateLimiter, key, rule, exceeded);
  }

  /** Hash bcrypt của chuỗi ngẫu nhiên, tạo 1 lần/instance, chỉ để cân thời gian khi không có user. */
  /**
   * Tạo sẵn hash giả bcrypt khi khởi động (review I-02a Info), để request "user không tồn tại" đầu tiên không
   * chậm hơn các request khác. Composition root gọi 1 lần; không gọi thì vẫn tạo lười như cũ.
   */
  async warmUp(): Promise<void> {
    await this.fakeHash();
  }

  private fakeHash(): Promise<string> {
    this.dummyHash ??= bcrypt.hash(uuidv4(), this.saltRounds);
    return this.dummyHash;
  }
}

function incorrectPassword(): SessionException {
  return new SessionException(SessionValidation.SESSION_CURRENT_PASSWORD_INCORRECT, [
    fieldError(
      'currentPassword',
      SessionFieldErrorKey.CURRENT_PASSWORD_INCORRECT,
      'Current password is incorrect',
    ),
  ]);
}
