import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import { Inject, Injectable } from '@nestjs/common';
import {
  buildClearedCsrfCookie,
  buildClearedRefreshCookie,
  buildCsrfCookie,
  buildRefreshCookie,
  deriveCsrfToken,
  isValidCsrfToken,
  readRefreshCookie,
} from 'src/grpc/gateway/auth/refresh-cookie';
import { StorageGrpcClient, StorageRpcCallContext } from 'src/grpc/gateway/storage-grpc.client';
import { StorageRpcError } from 'src/grpc/gateway/storage-rpc.error';
import { w02EnumAdapter } from 'src/grpc/enum/w02-storage-enums';
import {
  REFRESH_EXPIRES_AT_METADATA_KEY,
  REFRESH_TOKEN_METADATA_KEY,
} from 'src/grpc/grpc.constants';
import { AccessTokenService } from 'src/session/access-token.service';
import { RateLimiter } from 'src/session/rate-limiter';
import { SessionException } from 'src/session/session.exception';
import { Clock } from 'src/session/session.policy';
import { SessionValidation } from 'src/session/session.validation';
import { v1Success, V1SuccessEnvelope } from 'src/shared/api-v1/envelope';
import { GatewayConfig } from '../gateway.config';
import { GATEWAY_CLOCK, GATEWAY_CONFIG, REFRESH_IP_RATE_LIMIT } from '../gateway.constants';
import { GatewayException } from '../gateway.exception';
import { GatewayRequestContext } from '../gateway-request';
import { GatewayValidation } from '../gateway.validation';
import { InMemoryFixedWindowRateLimiter } from '../in-memory-rate-limiter';
import {
  GatewayMappingError,
  toActionResult,
  toLoginResult,
  toSessionPage,
  V1ActionResult,
  V1LoginResult,
  V1SessionPage,
} from './gateway-auth.mapper';
import { V1ListOwnSessionsQueryDto, V1LoginDto, V1PasswordChangeDto } from './gateway-auth.dto';

/** Nơi controller ghi `Set-Cookie` (service không phụ thuộc kiểu response của Express). */
export type CookieSink = (cookies: string[]) => void;

/** Header HTTP Gateway cần cho `refresh`. */
export interface RefreshHeaders {
  origin?: string | string[];
  csrfToken?: string | string[];
  cookie?: string | string[];
}

interface RpcEnvelope {
  result?: unknown;
}

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;
const MS_PER_SECOND = 1_000;
const OK = 200;

/**
 * Logic HTTP v1 của Gateway cho phiên đăng nhập (W02 I-02b). Gateway KHÔNG có DB/repository nghiệp vụ: mọi
 * quyết định phiên ở Storage qua gRPC mTLS. Gateway chỉ làm phần biên của R2:
 * - kiểm chữ ký/iss/aud/exp access JWT trước khi chuyển nguyên văn sang Storage (architecture bước 2);
 * - refresh: throttle theo IP ⇒ Origin allowlist ⇒ cookie ⇒ CSRF, TRƯỚC khi gọi RPC (TC-AUTH-04: không rotate);
 * - đặt/xoá cookie `wh_refresh` (HttpOnly) + `wh_csrf` (đọc được bằng JS, DEV-197-08);
 * - map kết quả RPC sang schema OpenAPI + envelope v1 có traceId.
 */
@Injectable()
export class GatewayAuthService {
  private readonly tokens: AccessTokenService;
  private readonly refreshLimiter: RateLimiter;

  constructor(
    @Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig,
    @Inject(GATEWAY_CLOCK) private readonly clock: Clock,
    private readonly storage: StorageGrpcClient,
  ) {
    this.tokens = new AccessTokenService(config.accessTokenSecret, clock);
    this.refreshLimiter = new InMemoryFixedWindowRateLimiter(clock);
  }

  async login(
    dto: V1LoginDto,
    context: GatewayRequestContext,
    setCookies: CookieSink,
  ): Promise<V1SuccessEnvelope<V1LoginResult>> {
    const { response, headers } = await this.storage.unaryWithHeaders<RpcEnvelope>(
      'Login',
      { data: { phoneNumber: dto.phoneNumber, password: dto.password } },
      this.rpcContext(context),
    );
    return this.issue(response, headers, context, setCookies, 'Logged in');
  }

  async refresh(
    headers: RefreshHeaders,
    context: GatewayRequestContext,
    setCookies: CookieSink,
  ): Promise<V1SuccessEnvelope<V1LoginResult>> {
    await this.throttleRefresh(context);
    if (!this.config.originAllowlist.allows(headers.origin))
      throw new GatewayException(GatewayValidation.GATEWAY_ORIGIN_REJECTED);
    const refreshToken = readRefreshCookie(headers.cookie);
    if (!refreshToken) {
      setCookies(this.clearedCookies());
      throw new GatewayException(GatewayValidation.GATEWAY_REFRESH_COOKIE_MISSING);
    }
    if (!isValidCsrfToken(this.config.csrfSecret, refreshToken, headers.csrfToken))
      throw new GatewayException(GatewayValidation.GATEWAY_CSRF_INVALID);

    let result: { response: RpcEnvelope; headers: Metadata };
    try {
      result = await this.storage.unaryWithHeaders<RpcEnvelope>(
        'Refresh',
        { refreshCookieToken: refreshToken },
        this.rpcContext(context),
      );
    } catch (error) {
      // Phiên đã hết (401) ⇒ xoá cookie để trình duyệt không gửi lại token chết; lỗi vẫn ném nguyên vẹn.
      if (error instanceof StorageRpcError && error.grpcCode === GrpcStatus.UNAUTHENTICATED)
        setCookies(this.clearedCookies());
      throw error;
    }
    return this.issue(result.response, result.headers, context, setCookies, 'Session refreshed');
  }

  /** Logout chỉ phiên hiện tại; lặp lại ⇒ cùng kết quả (Storage). Luôn xoá cookie khi thành công. */
  async logout(
    authorization: string | undefined,
    context: GatewayRequestContext,
    setCookies: CookieSink,
  ): Promise<V1SuccessEnvelope<V1ActionResult>> {
    return this.sessionAction('Logout', {}, authorization, context, setCookies, 'Logged out');
  }

  async logoutAll(
    authorization: string | undefined,
    context: GatewayRequestContext,
    setCookies: CookieSink,
  ): Promise<V1SuccessEnvelope<V1ActionResult>> {
    return this.sessionAction(
      'Logoutall',
      {},
      authorization,
      context,
      setCookies,
      'Logged out everywhere',
    );
  }

  /** Khoá phiên (UI-02): refresh cookie vô dụng sau khoá ⇒ xoá luôn. */
  async lock(
    authorization: string | undefined,
    context: GatewayRequestContext,
    setCookies: CookieSink,
  ): Promise<V1SuccessEnvelope<V1ActionResult>> {
    return this.sessionAction('Lock', {}, authorization, context, setCookies, 'Session locked');
  }

  async changeOwnPassword(
    authorization: string | undefined,
    dto: V1PasswordChangeDto,
    context: GatewayRequestContext,
  ): Promise<V1SuccessEnvelope<V1ActionResult>> {
    return this.sessionAction(
      'ChangeOwnPassword',
      { data: { currentPassword: dto.currentPassword, newPassword: dto.newPassword } },
      authorization,
      context,
      undefined,
      'Password changed',
    );
  }

  async recordActivity(
    authorization: string | undefined,
    context: GatewayRequestContext,
  ): Promise<V1SuccessEnvelope<V1ActionResult>> {
    return this.sessionAction(
      'RecordInteractiveActivity',
      {},
      authorization,
      context,
      undefined,
      'Activity recorded',
    );
  }

  async revokeOwnSession(
    authorization: string | undefined,
    id: string,
    context: GatewayRequestContext,
  ): Promise<V1SuccessEnvelope<V1ActionResult>> {
    return this.sessionAction(
      'RevokeOwnSession',
      { id },
      authorization,
      context,
      undefined,
      'Session revoked',
    );
  }

  async listOwnSessions(
    authorization: string | undefined,
    query: V1ListOwnSessionsQueryDto,
    context: GatewayRequestContext,
  ): Promise<V1SuccessEnvelope<V1SessionPage>> {
    const request: Record<string, unknown> = {};
    if (query.page !== undefined) request.page = String(query.page);
    if (query.pageSize !== undefined) request.pageSize = String(query.pageSize);
    if (query.q !== undefined) request.q = query.q;
    // DEV-197-02: enum OpenAPI → tên proto có prefix qua adapter sinh từ proto (giá trị lạ ⇒ lỗi, không pass).
    if (query.sortBy !== undefined)
      request.sortBy = w02EnumAdapter('listOwnSessions?sortBy').toWire(query.sortBy);
    if (query.sort !== undefined)
      request.sort = w02EnumAdapter('listOwnSessions?sort').toWire(query.sort);
    const response = await this.storage.unary<RpcEnvelope>(
      'ListOwnSessions',
      request,
      this.rpcContext(context, this.verifyAccess(authorization)),
    );
    return v1Success(
      toSessionPage(response.result),
      context.traceId,
      'Sessions',
      OK,
      this.clock.now(),
    );
  }

  private async sessionAction(
    rpc: string,
    request: object,
    authorization: string | undefined,
    context: GatewayRequestContext,
    setCookies: CookieSink | undefined,
    message: string,
  ): Promise<V1SuccessEnvelope<V1ActionResult>> {
    const response = await this.storage.unary<RpcEnvelope>(
      rpc,
      request,
      this.rpcContext(context, this.verifyAccess(authorization)),
    );
    setCookies?.(this.clearedCookies());
    return v1Success(
      toActionResult(response.result, context.traceId),
      context.traceId,
      message,
      OK,
      this.clock.now(),
    );
  }

  /**
   * Gateway kiểm access JWT (chữ ký/iss/aud/exp/typ) trước RPC — architecture "Đường tin cậy" bước 2. Sai ⇒
   * 401 cùng mã Storage dùng, RPC không được gửi. Storage vẫn tự kiểm lại + kiểm phiên trong DB.
   * `Authorization` phải đúng `Bearer <jwt>` một dấu cách (follow-up I2: chặt hơn passport legacy).
   */
  private verifyAccess(authorization: string | undefined): string {
    if (!authorization) throw new SessionException(SessionValidation.SESSION_ACCESS_TOKEN_MISSING);
    const match = BEARER.exec(authorization);
    if (!match) throw new SessionException(SessionValidation.SESSION_ACCESS_TOKEN_INVALID);
    this.tokens.verify(match[1]);
    return authorization;
  }

  private rpcContext(
    context: GatewayRequestContext,
    authorization?: string,
  ): StorageRpcCallContext {
    return {
      traceId: context.traceId,
      authorization,
      client: { ip: context.ip, userAgent: context.userAgent },
    };
  }

  /** IP thiếu ⇒ 503 (không gom mọi client vào 1 bucket — review I-02a L1). */
  private async throttleRefresh(context: GatewayRequestContext): Promise<void> {
    if (!context.ip) throw new GatewayException(GatewayValidation.GATEWAY_CLIENT_IP_UNAVAILABLE);
    if (!(await this.refreshLimiter.hit(`refresh-ip:${context.ip}`, REFRESH_IP_RATE_LIMIT)))
      throw new GatewayException(GatewayValidation.GATEWAY_RATE_LIMITED);
  }

  /** Login/Refresh thành công: đặt 2 cookie theo tuổi còn lại của phiên, trả `LoginResult` + `csrfToken`. */
  private issue(
    response: RpcEnvelope,
    headers: Metadata,
    context: GatewayRequestContext,
    setCookies: CookieSink,
    message: string,
  ): V1SuccessEnvelope<V1LoginResult> {
    const refreshToken = singleHeader(headers, REFRESH_TOKEN_METADATA_KEY);
    const expiresAt = Date.parse(singleHeader(headers, REFRESH_EXPIRES_AT_METADATA_KEY));
    if (Number.isNaN(expiresAt)) throw new GatewayMappingError('refresh cookie expiry');
    const maxAgeSeconds = Math.max(
      0,
      Math.floor((expiresAt - this.clock.now().getTime()) / MS_PER_SECOND),
    );
    const csrfToken = deriveCsrfToken(this.config.csrfSecret, refreshToken);
    const cookieOptions = { maxAgeSeconds, secure: this.config.cookieSecure };
    const result = toLoginResult(response.result, csrfToken);
    setCookies([
      buildRefreshCookie(refreshToken, cookieOptions),
      buildCsrfCookie(csrfToken, cookieOptions),
    ]);
    return v1Success(result, context.traceId, message, OK, this.clock.now());
  }

  private clearedCookies(): string[] {
    return [
      buildClearedRefreshCookie(this.config.cookieSecure),
      buildClearedCsrfCookie(this.config.cookieSecure),
    ];
  }
}

function singleHeader(headers: Metadata, key: string): string {
  const values = headers.get(key);
  if (values.length !== 1 || typeof values[0] !== 'string')
    throw new GatewayMappingError(`response header ${key}`);
  return values[0];
}
