import { ACCESS_TOKEN_TTL_SECONDS } from 'src/session/session.constants';

/**
 * Map kết quả RPC (proto decode: int64 là chuỗi, field optional có thể vắng) → schema OpenAPI R2. Chỉ chép
 * field có trong schema (OpenAPI `additionalProperties: false`); thiếu field bắt buộc ⇒ `GatewayMappingError`
 * (500), không bịa giá trị.
 */
export class GatewayMappingError extends Error {
  constructor(readonly schema: string) {
    super(`Storage response does not match ${schema}`);
    this.name = 'GatewayMappingError';
  }
}

type Raw = Record<string, unknown>;

const asRaw = (value: unknown, schema: string): Raw => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new GatewayMappingError(schema);
  return value as Raw;
};

function requireString(raw: Raw, key: string, schema: string): string {
  const value = raw[key];
  if (typeof value !== 'string' || value.length === 0) throw new GatewayMappingError(schema);
  return value;
}

function requireBoolean(raw: Raw, key: string, schema: string): boolean {
  const value = raw[key];
  if (typeof value !== 'boolean') throw new GatewayMappingError(schema);
  return value;
}

/** int64 proto (chuỗi do `longs: String`) → số nguyên an toàn ≥ `min`. */
function requireInt(raw: Raw, key: string, schema: string, min: number): number {
  const value = raw[key];
  const parsed = typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < min) throw new GatewayMappingError(schema);
  return parsed;
}

/**
 * `User` trong `LoginResult` — DEV-197-12: Storage mới có nguồn cho `id`, `phoneNumber`, `isActive`.
 * KHÔNG trả `warehouseIds`/`highlights` (proto-loader `arrays: true` thêm `[]` rỗng — sai sự thật) và không
 * bịa `displayName`/`email`/`role`/`version`. Các field required còn thiếu so với OpenAPI chờ I-03/DEV-196-02.
 */
export const LOGIN_USER_FIELDS_WITH_SOURCE = ['id', 'phoneNumber', 'isActive'] as const;
export const LOGIN_USER_FIELDS_PENDING = [
  'displayName',
  'email',
  'role',
  'warehouseIds',
  'version',
] as const;

export interface V1LoginUser {
  id: string;
  phoneNumber: string;
  isActive: boolean;
}

export interface V1LoginResult {
  accessToken: string;
  expiresIn: number;
  user: V1LoginUser;
  sessionId: string;
  csrfToken: string;
}

export function toLoginResult(result: unknown, csrfToken: string): V1LoginResult {
  const schema = 'LoginResult';
  const raw = asRaw(result, schema);
  const user = asRaw(raw.user, schema);
  return {
    accessToken: requireString(raw, 'accessToken', schema),
    // OpenAPI `const: 900`; proto khai `Struct` (DEV-197-11) nên Storage không điền — giá trị từ hằng chung.
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: {
      id: requireString(user, 'id', schema),
      phoneNumber: requireString(user, 'phoneNumber', schema),
      isActive: requireBoolean(user, 'isActive', schema),
    },
    sessionId: requireString(raw, 'sessionId', schema),
    csrfToken,
  };
}

export interface V1ActionResult {
  id: string;
  version: number;
  status: string;
  traceId: string;
}

/** `ActionResult`: traceId là traceId của request Gateway (không lấy từ Storage). */
export function toActionResult(result: unknown, traceId: string): V1ActionResult {
  const schema = 'ActionResult';
  const raw = asRaw(result, schema);
  return {
    id: requireString(raw, 'id', schema),
    version: requireInt(raw, 'version', schema, 1),
    status: requireString(raw, 'status', schema),
    traceId,
  };
}

export interface V1Session {
  id: string;
  isCurrent: boolean;
  createdAt: string;
  lastInteractiveAt: string;
  idleExpiresAt: string;
  expiresAt: string;
  ipMasked?: string;
  userAgent?: string;
}

function toSession(value: unknown): V1Session {
  const schema = 'Session';
  const raw = asRaw(value, schema);
  const session: V1Session = {
    id: requireString(raw, 'id', schema),
    isCurrent: requireBoolean(raw, 'isCurrent', schema),
    createdAt: requireString(raw, 'createdAt', schema),
    lastInteractiveAt: requireString(raw, 'lastInteractiveAt', schema),
    idleExpiresAt: requireString(raw, 'idleExpiresAt', schema),
    expiresAt: requireString(raw, 'expiresAt', schema),
  };
  if (typeof raw.ipMasked === 'string') session.ipMasked = raw.ipMasked;
  if (typeof raw.userAgent === 'string') session.userAgent = raw.userAgent;
  return session;
}

export interface V1SessionPage {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
  items: V1Session[];
}

export function toSessionPage(result: unknown): V1SessionPage {
  const schema = 'listOwnSessions result';
  const raw = asRaw(result, schema);
  const items = raw.items;
  if (!Array.isArray(items)) throw new GatewayMappingError(schema);
  return {
    page: requireInt(raw, 'page', schema, 1),
    pageSize: requireInt(raw, 'pageSize', schema, 1),
    total: raw.total === undefined ? 0 : requireInt(raw, 'total', schema, 0),
    totalPages: raw.totalPages === undefined ? 0 : requireInt(raw, 'totalPages', schema, 0),
    hasNext: raw.hasNext === true,
    hasPrevious: raw.hasPrevious === true,
    items: items.map(toSession),
  };
}
