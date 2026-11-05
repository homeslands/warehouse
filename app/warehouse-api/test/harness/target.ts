import { execFileSync } from 'child_process';
import { readFileSync, statSync } from 'fs';
import { isAbsolute } from 'path';

/**
 * Target test duy nhất mà harness được phép chạm. Mọi giá trị đến từ file grant do điều phối cấp
 * (non-secret `target.json` + file credential 0600), KHÔNG đến từ `.env` hay biến `DATABASE_*` có sẵn.
 */
export interface HarnessTarget {
  id: string;
  mysql: {
    container: string;
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  redis: { container: string; host: string; port: number };
  containerLabel: string;
}

export class HarnessTargetError extends Error {
  constructor(message: string) {
    super(`[e2e-harness] target rejected: ${message}`);
    this.name = 'HarnessTargetError';
  }
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const TEST_DB_NAME = /^warehouse_test_[a-z0-9_]+$/;
const LABEL = /^[\w.-]+=[\w.-]+$/;
/** Biến môi trường mà nếu đã có sẵn thì nghĩa là đang có config khác (thường từ `.env`) chen vào. */
const FOREIGN_ENV_KEYS = [
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_USERNAME',
  'DATABASE_PASSWORD',
  'DATABASE_NAME',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
];

type Json = Record<string, unknown>;

const asObject = (value: unknown, field: string): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HarnessTargetError(`${field} must be an object`);
  return value as Json;
};

const asString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim())
    throw new HarnessTargetError(`${field} must be a non-empty string`);
  return value;
};

const asPort = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 65535)
    throw new HarnessTargetError(`${field} must be a TCP port`);
  return value;
};

/**
 * Kiểm tra thuần (không I/O) — dùng cho unit test TC01. Ném lỗi với mọi lệch allowlist: host không
 * loopback, tên DB không phải DB test, user root, thiếu container, biến `DATABASE_*`/`REDIS_*` lạ.
 */
export function validateTarget(
  descriptor: unknown,
  credential: unknown,
  containerLabel: string | undefined,
  env: NodeJS.ProcessEnv,
): HarnessTarget {
  const foreign = FOREIGN_ENV_KEYS.filter((key) => env[key] !== undefined);
  if (foreign.length)
    throw new HarnessTargetError(
      `pre-existing ${foreign.join(', ')} in environment; harness only accepts the grant files`,
    );

  if (!containerLabel || !LABEL.test(containerLabel))
    throw new HarnessTargetError('WH_E2E_CONTAINER_LABEL must look like key=value');

  const root = asObject(descriptor, 'target');
  const mysql = asObject(root.mysql, 'target.mysql');
  const redis = asObject(root.redis, 'target.redis');
  const cred = asObject(credential, 'credential');

  const target: HarnessTarget = {
    id: asString(root.id, 'target.id'),
    mysql: {
      container: asString(mysql.container, 'target.mysql.container'),
      host: asString(mysql.host, 'target.mysql.host'),
      port: asPort(mysql.port, 'target.mysql.port'),
      database: asString(mysql.database, 'target.mysql.database'),
      user: asString(mysql.user, 'target.mysql.user'),
      password: asString(cred.password, 'credential.password'),
    },
    redis: {
      container: asString(redis.container, 'target.redis.container'),
      host: asString(redis.host, 'target.redis.host'),
      port: asPort(redis.port, 'target.redis.port'),
    },
    containerLabel,
  };

  if (!LOOPBACK_HOSTS.has(target.mysql.host) || !LOOPBACK_HOSTS.has(target.redis.host))
    throw new HarnessTargetError('only loopback MySQL/Redis hosts are allowed');
  if (!TEST_DB_NAME.test(target.mysql.database))
    throw new HarnessTargetError(
      `database "${target.mysql.database}" is not a warehouse_test_* DB`,
    );
  if (target.mysql.user === 'root') throw new HarnessTargetError('MySQL root user is not allowed');
  if (cred.database !== undefined && cred.database !== target.mysql.database)
    throw new HarnessTargetError('credential file belongs to another database');
  if (cred.user !== undefined && cred.user !== target.mysql.user)
    throw new HarnessTargetError('credential file belongs to another user');

  return target;
}

interface ContainerInfo {
  labels: Record<string, string>;
  hostPorts: string[];
}

export type InspectContainer = (name: string) => ContainerInfo;

export const dockerInspect: InspectContainer = (name) => {
  let raw: string;
  try {
    raw = execFileSync('docker', ['inspect', '--type', 'container', name], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new HarnessTargetError(`container "${name}" not found (docker inspect failed)`);
  }
  const [info] = JSON.parse(raw) as Array<{
    Config?: { Labels?: Record<string, string> };
    NetworkSettings?: {
      Ports?: Record<string, Array<{ HostIp: string; HostPort: string }> | null>;
    };
  }>;
  const hostPorts = Object.values(info?.NetworkSettings?.Ports ?? {})
    .flatMap((bindings) => bindings ?? [])
    .map((binding) => binding.HostPort);
  return { labels: info?.Config?.Labels ?? {}, hostPorts };
};

/**
 * Kiểm ownership container: đúng label của task cấp target VÀ port host trong grant thật sự do
 * container đó publish — tránh trường hợp port trỏ nhầm sang MySQL/Redis khác trên máy.
 */
export function assertContainerOwnership(target: HarnessTarget, inspect: InspectContainer): void {
  const [key, value] = target.containerLabel.split('=');
  for (const [name, port] of [
    [target.mysql.container, target.mysql.port],
    [target.redis.container, target.redis.port],
  ] as const) {
    const info = inspect(name);
    if (info.labels[key] !== value)
      throw new HarnessTargetError(`container "${name}" does not carry label ${key}=${value}`);
    if (!info.hostPorts.includes(String(port)))
      throw new HarnessTargetError(`container "${name}" does not publish host port ${port}`);
  }
}

const readJsonFile = (path: string, field: string, privateFile: boolean): unknown => {
  if (!path || !isAbsolute(path)) throw new HarnessTargetError(`${field} must be an absolute path`);
  let mode: number;
  try {
    mode = statSync(path).mode;
  } catch {
    throw new HarnessTargetError(`${field} not readable`);
  }
  // File credential phải 0600 (không group/other) — đúng chính sách của grant.
  if (privateFile && (mode & 0o077) !== 0)
    throw new HarnessTargetError(`${field} must not be group/other accessible`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new HarnessTargetError(`${field} is not valid JSON`);
  }
};

/**
 * Điểm vào duy nhất: đọc grant từ `WH_E2E_TARGET_FILE`, `WH_E2E_CREDENTIAL_FILE`,
 * `WH_E2E_CONTAINER_LABEL`; validate + kiểm container. Chưa mở kết nối nào. Thiếu biến ⇒ ném lỗi
 * (fail-closed, không tự skip suite).
 */
export function loadHarnessTarget(
  env: NodeJS.ProcessEnv = process.env,
  inspect: InspectContainer = dockerInspect,
): HarnessTarget {
  const descriptor = readJsonFile(env.WH_E2E_TARGET_FILE ?? '', 'WH_E2E_TARGET_FILE', false);
  const credential = readJsonFile(env.WH_E2E_CREDENTIAL_FILE ?? '', 'WH_E2E_CREDENTIAL_FILE', true);
  const target = validateTarget(descriptor, credential, env.WH_E2E_CONTAINER_LABEL, env);
  assertContainerOwnership(target, inspect);
  return target;
}
