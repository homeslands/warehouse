import { DataSource, EntityManager, Equal } from 'typeorm';
import { SessionPrincipal } from 'src/session/session.service';
import { allowedFamiliesOf } from './permission-policy';
import {
  V1AuthorityRecord,
  V1PermissionRecord,
  V1RoleRecord,
  V1UserRoleRecord,
} from './rbac-v1-records.entity';
import { isRoleFamily, RoleFamily } from './rbac-v1.types';
import { RbacException, RbacValidation } from './rbac-v1.validation';

/** Actor đã xác thực + quyền đọc từ DB ngay trong RPC (không cache — cache không phải nguồn cấp quyền). */
export interface V1Actor {
  userId: string;
  sessionId: string;
  roleId: string;
  /** `null` = role chưa đối soát family (SUPER_ADMIN, custom) ⇒ mọi quyền v1 bị từ chối. */
  family: RoleFamily | null;
  level: number;
  authorityCodes: ReadonlySet<string>;
}

/**
 * Quyết định thuần (business-rules §22-23; F-196-04): `required` là OR trên mã quyền (`x-authority` có `|`),
 * sau đó AND với family ceiling. KHÔNG có bypass theo tên role (`SUPER_ADMIN` chỉ có quyền nếu role có family
 * và có mã được cấp — thực tế family NULL ⇒ bị từ chối, DEV-196-03).
 * Mã giữ trong DB nhưng family không được phép theo policy (vd cấp tay từ legacy) ⇒ không được công nhận.
 */
export function assertAuthorized(actor: V1Actor, required: readonly string[]): void {
  if (!required.length)
    throw new RangeError('v1 operation without x-authority is denied by design');
  if (!actor.family) throw new RbacException(RbacValidation.RBAC_FAMILY_UNRESOLVED);
  const family = actor.family;
  const granted = required.some(
    (code) => actor.authorityCodes.has(code) && (allowedFamiliesOf(code) ?? []).includes(family),
  );
  if (!granted) throw new RbacException(RbacValidation.RBAC_PERMISSION_DENIED);
}

/** Chỉ quản lý được role có level THẤP HƠN level của chính mình (giữ quy tắc legacy `assertCanManage`). */
export function assertCanManageRole(actor: V1Actor, target: Pick<V1RoleRecord, 'level'>): void {
  if (target.level >= actor.level)
    throw new RbacException(RbacValidation.RBAC_ROLE_LEVEL_FORBIDDEN);
}

/**
 * Đọc actor từ DB (user active chưa xoá → role chưa xoá → mã quyền chưa xoá). Dùng `manager` của transaction
 * khi lệnh ghi cần đọc quyền nhất quán với dữ liệu đang khoá.
 */
export async function resolveActor(
  db: DataSource | EntityManager,
  principal: SessionPrincipal,
): Promise<V1Actor> {
  const manager = db instanceof DataSource ? db.manager : db;
  const user = await manager.findOne(V1UserRoleRecord, { where: { id: Equal(principal.userId) } });
  if (!user?.isActive) throw new RbacException(RbacValidation.RBAC_PERMISSION_DENIED);
  const role = await manager.findOne(V1RoleRecord, { where: { id: Equal(user.roleId) } });
  if (!role) throw new RbacException(RbacValidation.RBAC_FAMILY_UNRESOLVED);
  const codes = await manager
    .createQueryBuilder(V1AuthorityRecord, 'authority')
    .innerJoin(V1PermissionRecord, 'permission', 'permission.authorityId = authority.id')
    .where('permission.roleId = :roleId', { roleId: role.id })
    .andWhere('permission.deletedAt IS NULL')
    .select('authority.code', 'code')
    .getRawMany<{ code: string }>();
  return {
    userId: principal.userId,
    sessionId: principal.sessionId,
    roleId: role.id,
    family: isRoleFamily(role.family) ? role.family : null,
    level: role.level,
    authorityCodes: new Set(codes.map((row) => row.code)),
  };
}
