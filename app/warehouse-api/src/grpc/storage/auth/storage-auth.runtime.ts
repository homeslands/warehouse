import { UntypedServiceImplementation } from '@grpc/grpc-js';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { AccessTokenService } from 'src/session/access-token.service';
import { RedisFixedWindowRateLimiter } from 'src/session/rate-limiter';
import { ACCESS_TOKEN_SECRET_MIN_LENGTH, SESSION_CONFIG_KEYS } from 'src/session/session.constants';
import { Clock, systemClock } from 'src/session/session.policy';
import { SessionService } from 'src/session/session.service';
import { AuthorityV1Service } from 'src/rbac-v1/authority-v1.service';
import { RedisLegacyRbacCacheInvalidator } from 'src/rbac-v1/legacy-rbac-cache';
import { RoleV1Service } from 'src/rbac-v1/role-v1.service';
import { createStorageRbacHandlers } from '../rbac/storage-rbac.handlers';
import { createStorageAuthHandlers } from './storage-auth.handlers';

/** Cấu hình phiên phía Storage (W02 I-02b). Đọc qua ConfigService; sai ⇒ lỗi khi khởi động (fail-closed). */
export interface StorageSessionConfig {
  accessTokenSecret: string;
  saltRounds: number;
  /** Tiền tố namespace Redis cho key rate limit, kết thúc bằng `:` (vd `wh:v1:rl:`). */
  rateLimitPrefix: string;
}

const BCRYPT_MIN_ROUNDS = 4;
const BCRYPT_MAX_ROUNDS = 31;
const REDIS_PREFIX_FORMAT = /^[A-Za-z0-9_.-]+(?::[A-Za-z0-9_.-]+)*:$/;

/**
 * Lỗi cấu hình chỉ nêu TÊN biến, không bao giờ chứa giá trị (secret không lọt vào log khởi động).
 */
export class StorageSessionConfigError extends Error {
  constructor(key: string, rule: string) {
    super(`invalid configuration ${key}: ${rule}`);
    this.name = 'StorageSessionConfigError';
  }
}

export function readStorageSessionConfig(config: ConfigService): StorageSessionConfig {
  const keys = SESSION_CONFIG_KEYS;
  const secret = config.get<string>(keys.accessTokenSecret);
  if (typeof secret !== 'string' || secret.length < ACCESS_TOKEN_SECRET_MIN_LENGTH)
    throw new StorageSessionConfigError(
      keys.accessTokenSecret,
      `required, at least ${ACCESS_TOKEN_SECRET_MIN_LENGTH} characters`,
    );
  const saltRounds = Number(config.get<string | number>(keys.saltRounds));
  if (
    !Number.isSafeInteger(saltRounds) ||
    saltRounds < BCRYPT_MIN_ROUNDS ||
    saltRounds > BCRYPT_MAX_ROUNDS
  )
    throw new StorageSessionConfigError(
      keys.saltRounds,
      `integer in [${BCRYPT_MIN_ROUNDS}, ${BCRYPT_MAX_ROUNDS}]`,
    );
  const prefix = config.get<string>(keys.rateLimitPrefix);
  if (typeof prefix !== 'string' || !REDIS_PREFIX_FORMAT.test(prefix))
    throw new StorageSessionConfigError(keys.rateLimitPrefix, 'required, like "wh:v1:rl:"');
  return { accessTokenSecret: secret, saltRounds, rateLimitPrefix: prefix };
}

export interface StorageAuthRuntimeOptions {
  dataSource: DataSource;
  /** Client Redis dùng cho rate limit (fail-closed nếu Redis lỗi). */
  redis: Redis;
  config: StorageSessionConfig;
  /** Đồng hồ: production dùng `systemClock`; test inject để kiểm idle/hết hạn không sleep. */
  clock?: Clock;
  /**
   * Client Redis của DB cache RBAC **legacy** (`REDIS_AUTH_DB`) — để xoá cache legacy sau khi v1 đổi quyền
   * (I-03a). Có thể khác client rate limit.
   */
  legacyRbacRedis: Redis;
  /** Log lỗi không lường trước của handler (chỉ tên RPC/traceId/tên lỗi). */
  logError(message: string): void;
  /** Log cảnh báo (vd xoá cache legacy lỗi). */
  logWarn(message: string): void;
}

export interface StorageAuthRuntime {
  sessions: SessionService;
  handlers: UntypedServiceImplementation;
}

/**
 * Lắp phần phiên của composition root Storage (I-02b): `SessionService` + handler gRPC. Bootstrap Storage
 * (process riêng, I-07) chỉ cần thêm DataSource/Redis/mTLS rồi `startStorageGrpcServer(…, runtime.handlers)`.
 * Tạo sẵn hash giả bcrypt trước khi nhận request.
 */
export async function createStorageAuthRuntime(
  options: StorageAuthRuntimeOptions,
): Promise<StorageAuthRuntime> {
  const clock = options.clock ?? systemClock;
  const sessions = new SessionService({
    dataSource: options.dataSource,
    tokens: new AccessTokenService(options.config.accessTokenSecret, clock),
    rateLimiter: new RedisFixedWindowRateLimiter(options.redis, options.config.rateLimitPrefix),
    clock,
    saltRounds: options.config.saltRounds,
  });
  await sessions.warmUp();
  const legacyCache = new RedisLegacyRbacCacheInvalidator(
    options.legacyRbacRedis,
    options.dataSource,
    options.logWarn,
  );
  const base = { sessions, clock, logError: options.logError };
  return {
    sessions,
    handlers: {
      ...createStorageAuthHandlers(base),
      // I-03a: RBAC v1 (role/authority/permission). Key RPC không trùng với nhóm phiên.
      ...createStorageRbacHandlers({
        ...base,
        dataSource: options.dataSource,
        roles: new RoleV1Service(options.dataSource, legacyCache, clock),
        authorities: new AuthorityV1Service(options.dataSource),
      }),
    },
  };
}
