import { w02EnumAdapter } from 'src/grpc/enum/w02-storage-enums';
import {
  asRaw,
  GatewayMappingError,
  requireBoolean,
  requireInt,
  requireString,
} from '../auth/gateway-auth.mapper';

/** OpenAPI `Role` (7 field required + `description` tuỳ chọn; `highlights` chưa làm). */
export interface V1Role {
  id: string;
  name: string;
  family: string;
  level: number;
  builtIn: boolean;
  authorityCodes: string[];
  version: number;
  description?: string;
}

export function toRole(value: unknown): V1Role {
  const schema = 'Role';
  const raw = asRaw(value, schema);
  const codes = raw.authorityCodes;
  if (!Array.isArray(codes) || !codes.every((code) => typeof code === 'string'))
    throw new GatewayMappingError(schema);
  const role: V1Role = {
    id: requireString(raw, 'id', schema),
    name: requireString(raw, 'name', schema),
    // DEV-197-02: tên proto `FAMILY_ADMIN` → OpenAPI `ADMIN` qua adapter sinh từ proto (lạ ⇒ lỗi).
    family: w02EnumAdapter('Role.family').toApi(raw.family),
    level: requireInt(raw, 'level', schema, 0),
    builtIn: requireBoolean(raw, 'builtIn', schema),
    authorityCodes: codes as string[],
    version: requireInt(raw, 'version', schema, 1),
  };
  if (typeof raw.description === 'string') role.description = raw.description;
  return role;
}

export interface V1Authority {
  code: string;
  name: string;
  groupId: string;
  fixedInvariant: boolean;
}

export function toAuthority(value: unknown): V1Authority {
  const schema = 'Authority';
  const raw = asRaw(value, schema);
  return {
    code: requireString(raw, 'code', schema),
    name: requireString(raw, 'name', schema),
    groupId: requireString(raw, 'groupId', schema),
    fixedInvariant: requireBoolean(raw, 'fixedInvariant', schema),
  };
}

/**
 * `NamedMaster` cho authority group — chỉ field có nguồn (`id`, `name`, `createdAt`, `updatedAt`); `code`,
 * `version`, `isActive` (required) chưa có cột ⇒ PARTIAL (DEV-197-22), không bịa.
 */
export interface V1AuthorityGroup {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export function toAuthorityGroup(value: unknown): V1AuthorityGroup {
  const schema = 'NamedMaster';
  const raw = asRaw(value, schema);
  return {
    id: requireString(raw, 'id', schema),
    name: requireString(raw, 'name', schema),
    createdAt: requireString(raw, 'createdAt', schema),
    updatedAt: requireString(raw, 'updatedAt', schema),
  };
}
