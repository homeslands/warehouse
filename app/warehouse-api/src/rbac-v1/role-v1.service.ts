import { DataSource, EntityManager, Equal, In, IsNull, Like, Not } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { getRandomString } from 'src/app/app.subscriber';
import { escapeLike } from 'src/shared/utils/query.util';
import { Clock } from 'src/session/session.policy';
import { LegacyRbacCacheInvalidator } from './legacy-rbac-cache';
import { allowedFamiliesOf } from './permission-policy';
import {
  V1AuthorityRecord,
  V1PermissionRecord,
  V1RoleRecord,
  V1UserRoleRecord,
} from './rbac-v1-records.entity';
import { ListQuery, PatchInput } from './rbac-v1.request';
import { isRoleFamily, RoleFamily } from './rbac-v1.types';
import { RbacException, RbacValidation } from './rbac-v1.validation';
import { assertCanManageRole, V1Actor } from './v1-authorizer';

/** Role v1 đã đủ field bắt buộc của OpenAPI `Role` (family luôn có — role family NULL bị ẩn). */
export interface RoleView {
  id: string;
  name: string;
  family: RoleFamily;
  level: number;
  builtIn: boolean;
  authorityCodes: string[];
  version: number;
  description?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RoleActionOutcome {
  id: string;
  version: number;
  status: 'GRANTED' | 'REVOKED' | 'DELETED' | 'UNCHANGED';
}

const LOCK = { mode: 'pessimistic_write' } as const;

/**
 * Role v1 phía Storage (W02 I-03a; business-rules §22; #196 mục 5a):
 * - role family NULL (SUPER_ADMIN, custom chưa đối soát — DEV-196-03) không hiện ở v1 (404), không quản lý được;
 * - family/builtIn bất biến (RolePatch không có 2 field này); role builtIn không đổi tên/xoá (legacy dùng tên
 *   role làm khoá RBAC/claim JWT);
 * - mọi lệnh ghi: khoá role (`FOR UPDATE`), kiểm `version` và level trên bản đã khoá, `version++` khi đổi;
 * - đổi quyền: family ceiling theo permission-policy, `version` của role là cache epoch (DEV-196-04);
 * - cache legacy được xoá sau commit.
 * Audit các lệnh ghi: chưa có module audit — TODO(I05-AUDIT-RBAC), không giả audit.
 */
export class RoleV1Service {
  constructor(
    private readonly dataSource: DataSource,
    private readonly legacyCache: LegacyRbacCacheInvalidator,
    private readonly clock: Clock,
  ) {}

  async list(query: ListQuery): Promise<Page<RoleView>> {
    const where = {
      family: Not(IsNull()),
      ...(query.q ? { name: Like(`%${escapeLike(query.q)}%`) } : {}),
    };
    const [records, total] = await this.dataSource.getRepository(V1RoleRecord).findAndCount({
      where,
      order: { [query.sortBy]: query.sort, id: 'ASC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const codes = await this.codesByRole(
      this.dataSource.manager,
      records.map((r) => r.id),
    );
    return {
      items: records.map((record) => toView(record, codes.get(record.id) ?? [])),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<RoleView> {
    const record = await this.dataSource
      .getRepository(V1RoleRecord)
      .findOne({ where: { id: Equal(id), family: Not(IsNull()) } });
    if (!record) throw new RbacException(RbacValidation.RBAC_ROLE_NOT_FOUND);
    const codes = await this.codesByRole(this.dataSource.manager, [record.id]);
    return toView(record, codes.get(record.id) ?? []);
  }

  async update(
    actor: V1Actor,
    id: string,
    patch: PatchInput<'name' | 'description'>,
  ): Promise<RoleView> {
    let previousName = '';
    const view = await this.dataSource.transaction(async (manager) => {
      const role = await this.lockManageable(manager, actor, id, patch.version);
      previousName = role.name;
      const { name, description } = patch.fields;
      if (name !== undefined && name !== role.name) {
        if (role.builtIn) throw new RbacException(RbacValidation.RBAC_ROLE_BUILT_IN);
        // Tra cả role đã xoá mềm (như legacy): dùng lại tên cũ là nhận nhầm cache/quyền theo tên.
        const taken = await manager.findOne(V1RoleRecord, {
          where: { name: Equal(name), id: Not(Equal(role.id)) },
          withDeleted: true,
        });
        if (taken) throw new RbacException(RbacValidation.RBAC_ROLE_NAME_TAKEN);
        role.name = name;
      }
      if (description !== undefined) role.description = description;
      role.version += 1;
      await manager.update(
        V1RoleRecord,
        { id: Equal(role.id) },
        { name: role.name, description: role.description, version: role.version },
      );
      const codes = await this.codesByRole(manager, [role.id]);
      return toView(role, codes.get(role.id) ?? []);
    });
    await this.legacyCache.invalidateRole(view.id, [...new Set([previousName, view.name])]);
    return view;
  }

  async remove(actor: V1Actor, id: string, version: number): Promise<RoleActionOutcome> {
    return this.dataSource.transaction(async (manager) => {
      const role = await this.lockManageable(manager, actor, id, version);
      if (role.builtIn) throw new RbacException(RbacValidation.RBAC_ROLE_BUILT_IN);
      // Đếm cả user đã xoá mềm (như legacy): khôi phục user đó sẽ trỏ vào role không còn.
      const assigned = await manager.count(V1UserRoleRecord, {
        where: { roleId: Equal(role.id) },
        withDeleted: true,
      });
      if (assigned > 0) throw new RbacException(RbacValidation.RBAC_ROLE_IN_USE);
      role.version += 1;
      await manager.update(
        V1RoleRecord,
        { id: Equal(role.id) },
        { version: role.version, deletedAt: this.clock.now() },
      );
      return { id: role.id, version: role.version, status: 'DELETED' };
    });
  }

  /**
   * Cấp 1 mã quyền (PUT, idempotent). Family ceiling: mã phải cho phép family của role (TC-RBAC-04/07); mã
   * không có trong policy R2 ⇒ từ chối. Đã có ⇒ `UNCHANGED`, không tăng version.
   */
  async grant(actor: V1Actor, id: string, code: string): Promise<RoleActionOutcome> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const role = await this.lockManageable(manager, actor, id);
      const authority = await this.findAuthority(manager, code);
      const family = role.family as RoleFamily;
      if (!(allowedFamiliesOf(code) ?? []).includes(family))
        throw new RbacException(RbacValidation.RBAC_FAMILY_CEILING);
      const existing = await manager.findOne(V1PermissionRecord, {
        where: { roleId: Equal(role.id), authorityId: Equal(authority.id) },
      });
      if (existing) return this.outcome(role, 'UNCHANGED');
      await manager.insert(V1PermissionRecord, {
        id: uuidv4(),
        slug: getRandomString(),
        roleId: role.id,
        authorityId: authority.id,
        deletedAt: null,
      });
      return this.bump(manager, role, 'GRANTED');
    });
    await this.invalidateIfChanged(outcome, id);
    return outcome;
  }

  /** Thu hồi 1 mã quyền (DELETE, `version` bắt buộc). Không có ⇒ `UNCHANGED`. */
  async revoke(
    actor: V1Actor,
    id: string,
    code: string,
    version: number,
  ): Promise<RoleActionOutcome> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const role = await this.lockManageable(manager, actor, id, version);
      const authority = await this.findAuthority(manager, code);
      const result = await manager.delete(V1PermissionRecord, {
        roleId: Equal(role.id),
        authorityId: Equal(authority.id),
      });
      if (!result.affected) return this.outcome(role, 'UNCHANGED');
      return this.bump(manager, role, 'REVOKED');
    });
    await this.invalidateIfChanged(outcome, id);
    return outcome;
  }

  /** Khoá role, kiểm tồn tại/family/version/level TRÊN BẢN ĐÃ KHOÁ (business-rules: check trong transaction). */
  private async lockManageable(
    manager: EntityManager,
    actor: V1Actor,
    id: string,
    expectedVersion?: number,
  ): Promise<V1RoleRecord> {
    const role = await manager.findOne(V1RoleRecord, { where: { id: Equal(id) }, lock: LOCK });
    if (!role || !isRoleFamily(role.family))
      throw new RbacException(RbacValidation.RBAC_ROLE_NOT_FOUND);
    assertCanManageRole(actor, role);
    if (expectedVersion !== undefined && role.version !== expectedVersion)
      throw new RbacException(RbacValidation.RBAC_VERSION_CONFLICT);
    return role;
  }

  private async findAuthority(manager: EntityManager, code: string): Promise<V1AuthorityRecord> {
    const authority = await manager.findOne(V1AuthorityRecord, { where: { code: Equal(code) } });
    if (!authority) throw new RbacException(RbacValidation.RBAC_AUTHORITY_NOT_FOUND);
    if (authority.fixedInvariant)
      throw new RbacException(RbacValidation.RBAC_AUTHORITY_FIXED_INVARIANT);
    return authority;
  }

  private async bump(
    manager: EntityManager,
    role: V1RoleRecord,
    status: RoleActionOutcome['status'],
  ): Promise<RoleActionOutcome> {
    role.version += 1;
    await manager.update(V1RoleRecord, { id: Equal(role.id) }, { version: role.version });
    return this.outcome(role, status);
  }

  private outcome(role: V1RoleRecord, status: RoleActionOutcome['status']): RoleActionOutcome {
    return { id: role.id, version: role.version, status };
  }

  private async invalidateIfChanged(outcome: RoleActionOutcome, id: string): Promise<void> {
    if (outcome.status === 'UNCHANGED') return;
    const role = await this.dataSource
      .getRepository(V1RoleRecord)
      .findOne({ where: { id: Equal(id) } });
    if (role) await this.legacyCache.invalidateRole(role.id, [role.name]);
  }

  private async codesByRole(
    manager: EntityManager,
    roleIds: string[],
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (!roleIds.length) return map;
    const rows = await manager
      .createQueryBuilder(V1PermissionRecord, 'permission')
      .innerJoin(V1AuthorityRecord, 'authority', 'authority.id = permission.authorityId')
      .where({ roleId: In(roleIds) })
      .andWhere('authority.deletedAt IS NULL')
      .select('permission.roleId', 'roleId')
      .addSelect('authority.code', 'code')
      .orderBy('authority.code', 'ASC')
      .getRawMany<{ roleId: string; code: string }>();
    for (const row of rows) map.set(row.roleId, [...(map.get(row.roleId) ?? []), row.code]);
    return map;
  }
}

function toView(record: V1RoleRecord, authorityCodes: string[]): RoleView {
  const view: RoleView = {
    id: record.id,
    name: record.name,
    family: record.family as RoleFamily,
    level: record.level,
    builtIn: record.builtIn,
    authorityCodes,
    version: record.version,
  };
  if (record.description) view.description = record.description;
  return view;
}
