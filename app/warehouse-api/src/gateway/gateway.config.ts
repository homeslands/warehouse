import { ConfigService } from '@nestjs/config';
import { isIP } from 'net';
import { readStorageGrpcClientConfig } from 'src/grpc/gateway/storage-grpc-client.module';
import {
  assertStorageDeadlineMs,
  StorageGrpcClientConfig,
} from 'src/grpc/gateway/storage-grpc.client';
import { CSRF_SECRET_MIN_LENGTH, OriginAllowlist } from 'src/grpc/gateway/auth/refresh-cookie';
import { ACCESS_TOKEN_SECRET_MIN_LENGTH, SESSION_CONFIG_KEYS } from 'src/session/session.constants';

/**
 * Biến cấu hình của composition root Gateway v1 (W02 I-02b). Validation RIÊNG ở đây, không đụng
 * `src/app/env.validation.ts` của legacy: Gateway là process riêng, legacy không cần các biến này.
 */
export const GATEWAY_CONFIG_KEYS = {
  port: 'GATEWAY_PORT',
  csrfSecret: 'GATEWAY_CSRF_SECRET',
  originAllowlist: 'GATEWAY_ORIGIN_ALLOWLIST',
  cookieSecure: 'GATEWAY_COOKIE_SECURE',
  trustProxy: 'GATEWAY_TRUST_PROXY',
  accessTokenSecret: SESSION_CONFIG_KEYS.accessTokenSecret,
} as const;

export interface GatewayConfig {
  storage: StorageGrpcClientConfig;
  /** Secret JWT access v1 (dùng chung với Storage) — Gateway kiểm chữ ký/iss/aud/exp trước khi gọi RPC. */
  accessTokenSecret: string;
  csrfSecret: string;
  originAllowlist: OriginAllowlist;
  /** Origin đã chuẩn hoá (cho CORS `credentials: true`, không wildcard). */
  origins: string[];
  /** Cookie `Secure`. Mặc định `true`; chỉ tắt cho localhost HTTP test (D14 mục 6 — ghi ngoại lệ môi trường). */
  cookieSecure: boolean;
  /**
   * Giá trị Express `trust proxy` (nguồn IP client, review I-02a L1). Không đặt ⇒ IP = địa chỉ socket.
   * Chỉ đặt khi Gateway thật sự đứng sau proxy tin cậy (vd `loopback`, `10.0.0.0/8`, số hop).
   */
  trustProxy?: string | number;
  port?: number;
}

/** Lỗi cấu hình: chỉ nêu tên biến + luật, KHÔNG BAO GIỜ chứa giá trị (secret không lọt vào log). */
export class GatewayConfigError extends Error {
  constructor(key: string, rule: string) {
    super(`invalid configuration ${key}: ${rule}`);
    this.name = 'GatewayConfigError';
  }
}

/**
 * `trust proxy` (review I-02b L3): tin X-Forwarded-For từ dải quá rộng = cho client tự khai IP ⇒ vô hiệu
 * throttle theo IP. Chỉ nhận:
 * - số hop 1..3 (phải khớp đúng số proxy thật trước Gateway — DEV-197-19);
 * - `loopback` / `linklocal` / `uniquelocal`, IP đơn, hoặc CIDR có prefix IPv4 ≥ /8, IPv6 ≥ /16 (không /0,
 *   không dải "cả Internet"; /8 là dải private lớn nhất `10.0.0.0/8`, /16 bao trùm mọi khối ULA/site thực tế).
 */
const TRUST_PROXY_NAMES = new Set(['loopback', 'linklocal', 'uniquelocal']);
const MIN_TRUST_PROXY_HOPS = 1;
const MAX_TRUST_PROXY_HOPS = 3;
const MIN_IPV4_PREFIX = 8;
const MIN_IPV6_PREFIX = 16;
const MAX_IPV4_PREFIX = 32;
const MAX_IPV6_PREFIX = 128;
const IPV4 = 4;
const MAX_PORT = 65_535;

function requireSecret(config: ConfigService, key: string, minLength: number): string {
  const value = config.get<string>(key);
  if (typeof value !== 'string' || value.length < minLength)
    throw new GatewayConfigError(key, `required, at least ${minLength} characters`);
  return value;
}

function readOrigins(config: ConfigService): { allowlist: OriginAllowlist; origins: string[] } {
  const key = GATEWAY_CONFIG_KEYS.originAllowlist;
  const raw = config.get<string>(key);
  const entries = (typeof raw === 'string' ? raw.split(',') : []).map((item) => item.trim());
  if (!entries.length || entries.some((item) => item.length === 0))
    throw new GatewayConfigError(key, 'required, comma-separated exact origins');
  try {
    const allowlist = new OriginAllowlist(entries);
    return { allowlist, origins: entries.map((entry) => new URL(entry).origin) };
  } catch {
    // Không chép message gốc (có thể chứa giá trị); chỉ báo tên biến + luật.
    throw new GatewayConfigError(
      key,
      'each entry must be scheme://host[:port], no wildcard or path',
    );
  }
}

function readBoolean(config: ConfigService, key: string, fallback: boolean): boolean {
  const raw = config.get<string | boolean>(key);
  if (raw === undefined || raw === '') return fallback;
  if (raw === true || raw === 'true') return true;
  if (raw === false || raw === 'false') return false;
  throw new GatewayConfigError(key, 'must be "true" or "false"');
}

function isTrustedProxyToken(token: string): boolean {
  if (TRUST_PROXY_NAMES.has(token)) return true;
  const [address, prefix, ...rest] = token.split('/');
  const version = isIP(address);
  if (!version || rest.length) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  const bits = Number(prefix);
  return version === IPV4
    ? bits >= MIN_IPV4_PREFIX && bits <= MAX_IPV4_PREFIX
    : bits >= MIN_IPV6_PREFIX && bits <= MAX_IPV6_PREFIX;
}

function readTrustProxy(config: ConfigService): string | number | undefined {
  const key = GATEWAY_CONFIG_KEYS.trustProxy;
  const raw = config.get<string>(key);
  if (raw === undefined || raw === '') return undefined;
  if (/^\d+$/.test(raw)) {
    const hops = Number(raw);
    if (hops < MIN_TRUST_PROXY_HOPS || hops > MAX_TRUST_PROXY_HOPS)
      throw new GatewayConfigError(
        key,
        `hop count must be in [${MIN_TRUST_PROXY_HOPS}, ${MAX_TRUST_PROXY_HOPS}]`,
      );
    return hops;
  }
  const tokens = raw.split(',').map((token) => token.trim());
  if (!tokens.every(isTrustedProxyToken))
    throw new GatewayConfigError(
      key,
      `loopback/linklocal/uniquelocal, IP, or CIDR with IPv4 prefix >= /${MIN_IPV4_PREFIX}, IPv6 >= /${MIN_IPV6_PREFIX}`,
    );
  return tokens.join(',');
}

function readPort(config: ConfigService): number | undefined {
  const raw = config.get<string | number>(GATEWAY_CONFIG_KEYS.port);
  if (raw === undefined || raw === '') return undefined;
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 0 || port > MAX_PORT)
    throw new GatewayConfigError(GATEWAY_CONFIG_KEYS.port, `integer in [0, ${MAX_PORT}]`);
  return port;
}

/** Đọc + validate toàn bộ cấu hình Gateway. Sai/thiếu ⇒ ném lỗi, Gateway không khởi động (fail-closed). */
export function readGatewayConfig(config: ConfigService): GatewayConfig {
  const { allowlist, origins } = readOrigins(config);
  const storage = readStorageGrpcClientConfig(config);
  // Kiểm trần deadline ngay khi đọc cấu hình (không đợi lúc dựng client) — DEV-197-06.
  assertStorageDeadlineMs(storage.deadlineMs);
  return {
    storage,
    accessTokenSecret: requireSecret(
      config,
      GATEWAY_CONFIG_KEYS.accessTokenSecret,
      ACCESS_TOKEN_SECRET_MIN_LENGTH,
    ),
    csrfSecret: requireSecret(config, GATEWAY_CONFIG_KEYS.csrfSecret, CSRF_SECRET_MIN_LENGTH),
    originAllowlist: allowlist,
    origins,
    cookieSecure: readBoolean(config, GATEWAY_CONFIG_KEYS.cookieSecure, true),
    trustProxy: readTrustProxy(config),
    port: readPort(config),
  };
}
