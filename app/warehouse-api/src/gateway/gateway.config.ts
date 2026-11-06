import { ConfigService } from '@nestjs/config';
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

const TRUST_PROXY_TOKEN = /^(loopback|linklocal|uniquelocal|[0-9A-Fa-f.:]+(?:\/\d{1,3})?)$/;
const MAX_TRUST_PROXY_HOPS = 10;
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

function readTrustProxy(config: ConfigService): string | number | undefined {
  const key = GATEWAY_CONFIG_KEYS.trustProxy;
  const raw = config.get<string>(key);
  if (raw === undefined || raw === '') return undefined;
  if (/^\d+$/.test(raw)) {
    const hops = Number(raw);
    if (hops > MAX_TRUST_PROXY_HOPS)
      throw new GatewayConfigError(key, `hop count must be <= ${MAX_TRUST_PROXY_HOPS}`);
    return hops;
  }
  const tokens = raw.split(',').map((token) => token.trim());
  if (!tokens.every((token) => TRUST_PROXY_TOKEN.test(token)))
    throw new GatewayConfigError(
      key,
      'hop count or comma list of loopback/linklocal/uniquelocal/IP/CIDR',
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
