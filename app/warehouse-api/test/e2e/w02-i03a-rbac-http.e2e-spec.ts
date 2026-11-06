import { Response } from 'supertest';
import { Equal, In } from 'typeorm';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import * as bcrypt from 'bcrypt';
import { getRandomString } from 'src/app/app.subscriber';
import { Role } from 'src/role/role.entity';
import { User } from 'src/user/user.entity';
import { roleAuthoritiesKey } from 'src/rbac/rbac.constants';
import {
  V1AuthorityRecord,
  V1PermissionRecord,
  V1RoleRecord,
} from 'src/rbac-v1/rbac-v1-records.entity';
import { writeEvidence } from '../harness/evidence';
import { createV1Stack, V1Stack } from './support/v1-stack';

/**
 * W02 I-03a — RBAC v1 qua HTTP THẬT: Gateway → gRPC mTLS → Storage (authorizer + RoleV1Service/AuthorityV1Service)
 * → MySQL/Redis target test. Actor fixture thật, không SUPER_ADMIN (ADMIN, MANAGER_A).
 * Mức: REAL_API_DB_REDIS (localhost HTTP).
 */
jest.setTimeout(180_000);

const API = '/api/v1';
const MIGRATION = 'ExpandRbacV11783728000049';
const NEW_CODES = [
  'USER_CHANGE_ROLE',
  'FILE_READ',
  'AUDIT_READ',
  'LOG_READ',
  'BACKUP_MANAGE',
  'JOB_READ',
];
const EXPECTED_GRANTS: Record<string, string[]> = {
  ADMIN: ['AUDIT_READ', 'BACKUP_MANAGE', 'FILE_READ', 'JOB_READ', 'LOG_READ', 'USER_CHANGE_ROLE'],
  MANAGER: ['AUDIT_READ', 'FILE_READ', 'JOB_READ'],
  SUPERVISOR: ['FILE_READ', 'JOB_READ'],
  SUPER_ADMIN: [],
};
const ROLE_KEYS = ['authorityCodes', 'builtIn', 'family', 'id', 'level', 'name', 'version'];

describe('W02 I-03a RBAC v1 over HTTP (real DB + Redis + mTLS)', () => {
  let stack: V1Stack;
  let admin: string;
  let manager: string;
  /** Role custom family MANAGER do test tạo (level 15 < ADMIN) — dọn sau test. */
  let customRoleId: string;
  let customRoleName: string;

  const bearer = (token: string) => `Bearer ${token}`;
  const as = (token: string) => ({ Authorization: bearer(token) });

  function expectError(response: Response, status: number, errorKey: string): void {
    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({ statusCode: status, errorKey });
    expect(uuidValidate(response.body.traceId)).toBe(true);
  }

  async function roleByName(name: string): Promise<V1RoleRecord> {
    const role = await stack.dataSource.getRepository(V1RoleRecord).findOne({
      where: { name: Equal(name) },
      withDeleted: true,
    });
    if (!role) throw new Error(`role ${name} missing`);
    return role;
  }

  async function grantsOf(roleId: string): Promise<string[]> {
    const rows = await stack.dataSource
      .createQueryBuilder(V1PermissionRecord, 'p')
      .innerJoin(V1AuthorityRecord, 'a', 'a.id = p.authorityId')
      .where('p.roleId = :roleId', { roleId })
      .select('a.code', 'code')
      .getRawMany<{ code: string }>();
    return rows.map((row) => row.code).sort();
  }

  /**
   * Tạo role custom family MANAGER SAU case MIG (case MIG chạy down/up 049, làm mất cột family). Tạo bằng entity
   * legacy (cần `slug_column`) rồi đặt family qua bản ghi v1 — như owner gán family sau đối soát.
   */
  async function createCustomRole(): Promise<void> {
    await stack.dataSource.getRepository(Role).insert({
      id: customRoleId,
      slug: getRandomString(),
      name: customRoleName,
      description: 'i03a test role',
      level: 15,
    });
    await stack.dataSource
      .getRepository(V1RoleRecord)
      .update({ id: Equal(customRoleId) }, { family: 'MANAGER' });
  }

  beforeAll(async () => {
    stack = await createV1Stack('i03a');
    admin = await stack.login('ADMIN');
    manager = await stack.login('MANAGER_A');
    customRoleId = uuidv4();
    customRoleName = `E2E_I03A_${customRoleId.slice(0, 8)}`;
  });

  afterAll(async () => {
    if (stack) {
      await stack.dataSource
        .getRepository(V1PermissionRecord)
        .delete({ roleId: Equal(customRoleId) });
      await stack.dataSource.getRepository(V1RoleRecord).delete({ id: Equal(customRoleId) });
      await stack.close();
    }
  });

  afterEach(() => expect(stack.storageErrors).toEqual([]));

  it('I03A-MIG 049: columns, backfill (family/builtIn/version), 6 new codes with policy grants, reconciliation list, down → up', async () => {
    const last = stack.migrations.history[stack.migrations.history.length - 1];
    expect(last.name).toBe(MIGRATION);
    const roles = await stack.dataSource.getRepository(V1RoleRecord).find({ withDeleted: true });
    const byName = new Map(roles.map((role) => [role.name, role]));
    for (const name of ['ADMIN', 'MANAGER', 'SUPERVISOR'])
      expect(byName.get(name)).toMatchObject({ family: name, builtIn: true });
    expect(byName.get('SUPER_ADMIN')).toMatchObject({ family: null, builtIn: true });
    // Danh sách đối soát (data-and-migration §70): role custom chưa có family — không tự gán.
    const reconciliation = roles
      .filter((role) => role.family === null && role.name !== 'SUPER_ADMIN')
      .map((role) => role.name)
      .sort();
    expect(reconciliation).toEqual(expect.arrayContaining(['E2E_SUPERVISOR_NO_EXPORT']));
    for (const [name, codes] of Object.entries(EXPECTED_GRANTS)) {
      const granted = (await grantsOf((await roleByName(name)).id)).filter((code) =>
        NEW_CODES.includes(code),
      );
      expect(granted).toEqual(codes);
    }

    // down rồi up lại qua cơ chế TypeORM (bảng `migrations`), chỉ phase expand, DB test riêng.
    await stack.dataSource.undoLastMigration({ transaction: 'each' });
    const columns = async () =>
      (
        await stack.dataSource.query(
          "SELECT CONCAT(TABLE_NAME, '.', COLUMN_NAME) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ('version_column','family_column','built_in_column','fixed_invariant_column') AND TABLE_NAME IN ('role_tbl','user_tbl','authority_tbl') ORDER BY c",
        )
      ).map((row: { c: string }) => row.c);
    expect(await columns()).toEqual([]);
    const codesAfterDown = await stack.dataSource
      .getRepository(V1AuthorityRecord)
      .count({ where: { code: In(NEW_CODES) } })
      .catch(() => -1);
    const reapplied = await stack.dataSource.runMigrations({ transaction: 'each' });
    expect(reapplied.map((migration) => migration.name)).toEqual([MIGRATION]);
    expect(await columns()).toEqual([
      'authority_tbl.fixed_invariant_column',
      'authority_tbl.version_column',
      'role_tbl.built_in_column',
      'role_tbl.family_column',
      'role_tbl.version_column',
      'user_tbl.version_column',
    ]);
    writeEvidence('I03A-MIG', {
      case: 'I03A-MIG',
      level: 'REAL_DB',
      targetId: stack.targetId,
      appliedThisRun: stack.migrations.applied,
      lastMigration: last,
      familyBackfill: ['ADMIN', 'MANAGER', 'SUPERVISOR'].map((name) => ({
        name,
        family: byName.get(name)?.family,
      })),
      superAdminFamily: byName.get('SUPER_ADMIN')?.family ?? null,
      reconciliationRoles: reconciliation,
      newCodeGrants: EXPECTED_GRANTS,
      downThenUp: {
        codesAfterDown,
        reapplied: reapplied.map((m) => m.name),
      },
    });
  });

  it('TC-API-listRoles / getRole: only roles with a family, Role schema, SUPER_ADMIN hidden', async () => {
    await createCustomRole();
    const list = await stack
      .http()
      .get(`${API}/roles`)
      .query({ pageSize: 100, sortBy: 'name', sort: 'ASC' })
      .set(as(admin));
    expect(list.status).toBe(200);
    const names = list.body.result.items.map((role: { name: string }) => role.name);
    expect(names).toEqual(
      expect.arrayContaining(['ADMIN', 'MANAGER', 'SUPERVISOR', customRoleName]),
    );
    expect(names).not.toContain('SUPER_ADMIN');
    expect(names).not.toContain('E2E_SUPERVISOR_NO_EXPORT');
    for (const role of list.body.result.items)
      expect(
        Object.keys(role)
          .filter((key) => key !== 'description')
          .sort(),
      ).toEqual(ROLE_KEYS);
    const managerRole = list.body.result.items.find(
      (role: { name: string }) => role.name === 'MANAGER',
    );
    expect(managerRole).toMatchObject({ family: 'MANAGER', builtIn: true });
    expect(managerRole.authorityCodes).toEqual(expect.arrayContaining(['FILE_READ', 'JOB_READ']));

    const one = await stack.http().get(`${API}/roles/${customRoleId}`).set(as(admin));
    expect(one.status).toBe(200);
    expect(one.body.result).toMatchObject({
      id: customRoleId,
      family: 'MANAGER',
      level: 15,
      version: 1,
    });
    const superAdmin = await roleByName('SUPER_ADMIN');
    expectError(
      await stack.http().get(`${API}/roles/${superAdmin.id}`).set(as(admin)),
      404,
      'RBAC_ROLE_NOT_FOUND',
    );
    expectError(
      await stack.http().get(`${API}/roles/${uuidv4()}`).set(as(admin)),
      404,
      'RBAC_ROLE_NOT_FOUND',
    );
    expectError(
      await stack.http().get(`${API}/roles`).query({ sortBy: 'code' }).set(as(admin)),
      422,
      'RBAC_REQUEST_INVALID',
    );
    writeEvidence('I03A-roles-read', {
      case: 'TC-API-listRoles / TC-API-getRole',
      level: 'REAL_API_DB_REDIS (localhost HTTP)',
      listed: names.length,
      superAdminHidden: true,
    });
  });

  it('TC-API-updateRole + TC-RBAC-08: version in locked tx (409), unknown/immutable fields 422, builtIn/level guards', async () => {
    const ok = await stack
      .http()
      .patch(`${API}/roles/${customRoleId}`)
      .set(as(admin))
      .send({ version: 1, description: 'updated by i03a' });
    expect(ok.status).toBe(200);
    expect(ok.body.result).toMatchObject({ description: 'updated by i03a', version: 2 });
    expectError(
      await stack
        .http()
        .patch(`${API}/roles/${customRoleId}`)
        .set(as(admin))
        .send({ version: 1, description: 'stale' }),
      409,
      'RBAC_VERSION_CONFLICT',
    );
    // TC-RBAC-08: PATCH role không được bulk grant / đổi family-builtIn.
    for (const extra of [
      { authorityCodes: ['MANAGE_PERMISSIONS'] },
      { family: 'ADMIN' },
      { builtIn: true },
    ]) {
      const response = await stack
        .http()
        .patch(`${API}/roles/${customRoleId}`)
        .set(as(admin))
        .send({ version: 2, ...extra });
      expectError(response, 422, 'GATEWAY_REQUEST_INVALID');
      expect(response.body.errors[0].errorKey).toBe('GATEWAY_PROPERTY_NOT_ALLOWED');
    }
    expect(await grantsOf(customRoleId)).toEqual([]);
    expectError(
      await stack
        .http()
        .patch(`${API}/roles/${customRoleId}`)
        .set(as(admin))
        .send({ version: 2, name: null }),
      422,
      'GATEWAY_REQUEST_INVALID',
    );
    expectError(
      await stack.http().patch(`${API}/roles/${customRoleId}`).set(as(admin)).send({ version: 2 }),
      422,
      'RBAC_REQUEST_INVALID',
    );
    const managerRole = await roleByName('MANAGER');
    expectError(
      await stack
        .http()
        .patch(`${API}/roles/${managerRole.id}`)
        .set(as(admin))
        .send({ version: managerRole.version, name: 'MANAGER_RENAMED' }),
      409,
      'RBAC_ROLE_BUILT_IN',
    );
    const adminRole = await roleByName('ADMIN');
    expectError(
      await stack
        .http()
        .patch(`${API}/roles/${adminRole.id}`)
        .set(as(admin))
        .send({ version: adminRole.version, description: 'x' }),
      403,
      'RBAC_ROLE_LEVEL_FORBIDDEN',
    );
    writeEvidence('TC-RBAC-08-http', {
      case: 'TC-API-updateRole / TC-RBAC-08',
      level: 'REAL_API_DB_REDIS (localhost HTTP)',
      bulkGrantViaPatch: 'GATEWAY_PROPERTY_NOT_ALLOWED',
      grantsAfter: 0,
      staleVersion: 'RBAC_VERSION_CONFLICT',
    });
  });

  it('TC-API-putRoleAuthority / deleteRoleAuthority + TC-RBAC-04/07: family ceiling, level, idempotency, epoch, legacy cache', async () => {
    const key = roleAuthoritiesKey(customRoleName);
    await stack.authRedis.set(key, '[]', 'EX', 60);
    const put = await stack
      .http()
      .put(`${API}/roles/${customRoleId}/authorities/FILE_READ`)
      .set(as(admin));
    expect(put.status).toBe(200);
    expect(put.body.result).toMatchObject({ id: customRoleId, status: 'GRANTED', version: 3 });
    expect(await stack.authRedis.exists(key)).toBe(0);
    const again = await stack
      .http()
      .put(`${API}/roles/${customRoleId}/authorities/FILE_READ`)
      .set(as(admin));
    expect(again.body.result).toMatchObject({ status: 'UNCHANGED', version: 3 });

    // TC-RBAC-04/07: Admin không cấp được mã vượt family ceiling của role MANAGER.
    const ceiling: Array<{ code: string; errorKey: string }> = [];
    for (const code of [
      'IMPORT_FORM_CREATE',
      'EXPORT_FORM_CREATE',
      'MANAGE_PERMISSIONS',
      'ROLE_UPDATE',
    ]) {
      const response = await stack
        .http()
        .put(`${API}/roles/${customRoleId}/authorities/${code}`)
        .set(as(admin));
      expectError(response, 403, 'RBAC_FAMILY_CEILING');
      ceiling.push({ code, errorKey: response.body.errorKey });
    }
    expect(await grantsOf(customRoleId)).toEqual(['FILE_READ']);
    expectError(
      await stack.http().put(`${API}/roles/${customRoleId}/authorities/NOT_A_CODE`).set(as(admin)),
      404,
      'RBAC_AUTHORITY_NOT_FOUND',
    );
    expectError(
      await stack.http().put(`${API}/roles/${customRoleId}/authorities/file_read`).set(as(admin)),
      422,
      'GATEWAY_REQUEST_INVALID',
    );
    const adminRole = await roleByName('ADMIN');
    expectError(
      await stack.http().put(`${API}/roles/${adminRole.id}/authorities/LOG_READ`).set(as(admin)),
      403,
      'RBAC_ROLE_LEVEL_FORBIDDEN',
    );

    expectError(
      await stack
        .http()
        .delete(`${API}/roles/${customRoleId}/authorities/FILE_READ`)
        .set(as(admin)),
      422,
      'GATEWAY_REQUEST_INVALID',
    );
    expectError(
      await stack
        .http()
        .delete(`${API}/roles/${customRoleId}/authorities/FILE_READ`)
        .query({ version: 2 })
        .set(as(admin)),
      409,
      'RBAC_VERSION_CONFLICT',
    );
    const revoked = await stack
      .http()
      .delete(`${API}/roles/${customRoleId}/authorities/FILE_READ`)
      .query({ version: 3 })
      .set(as(admin));
    expect(revoked.status).toBe(200);
    expect(revoked.body.result).toMatchObject({ status: 'REVOKED', version: 4 });
    expect(await grantsOf(customRoleId)).toEqual([]);
    writeEvidence('TC-RBAC-04-07-http', {
      case: 'TC-API-putRoleAuthority / TC-API-deleteRoleAuthority / TC-RBAC-04 (part) / TC-RBAC-07 (part)',
      level: 'REAL_API_DB_REDIS (localhost HTTP)',
      grant: put.body.result.status,
      repeatGrant: again.body.result.status,
      ceiling,
      legacyCacheInvalidated: true,
      revoke: revoked.body.result.status,
    });
  });

  it('TC-API-listAuthorities / listAuthorityGroups / updateAuthorityMetadata', async () => {
    const list = await stack
      .http()
      .get(`${API}/authorities`)
      .query({ pageSize: 100, sortBy: 'code', sort: 'ASC', q: 'READ' })
      .set(as(admin));
    expect(list.status).toBe(200);
    for (const item of list.body.result.items)
      expect(Object.keys(item).sort()).toEqual(['code', 'fixedInvariant', 'groupId', 'name']);
    const codes = list.body.result.items.map((item: { code: string }) => item.code);
    expect(codes).toEqual(
      expect.arrayContaining(['FILE_READ', 'JOB_READ', 'AUDIT_READ', 'LOG_READ']),
    );

    const groups = await stack
      .http()
      .get(`${API}/authority-groups`)
      .query({ pageSize: 100 })
      .set(as(admin));
    expect(groups.status).toBe(200);
    for (const item of groups.body.result.items)
      expect(Object.keys(item).sort()).toEqual(['createdAt', 'id', 'name', 'updatedAt']);

    const jobRead = await stack.dataSource
      .getRepository(V1AuthorityRecord)
      .findOneOrFail({ where: { code: 'JOB_READ' } });
    const patched = await stack
      .http()
      .patch(`${API}/authorities/${jobRead.id}`)
      .set(as(admin))
      .send({ version: jobRead.version, name: 'Xem job (i03a)' });
    expect(patched.status).toBe(200);
    expect(patched.body.result).toMatchObject({ code: 'JOB_READ', name: 'Xem job (i03a)' });
    expectError(
      await stack
        .http()
        .patch(`${API}/authorities/${jobRead.id}`)
        .set(as(admin))
        .send({ version: jobRead.version, name: 'stale' }),
      409,
      'RBAC_VERSION_CONFLICT',
    );
    expectError(
      await stack
        .http()
        .patch(`${API}/authorities/${jobRead.id}`)
        .set(as(admin))
        .send({ version: jobRead.version + 1, code: 'X' }),
      422,
      'GATEWAY_REQUEST_INVALID',
    );
    await stack
      .http()
      .patch(`${API}/authorities/${jobRead.id}`)
      .set(as(admin))
      .send({ version: jobRead.version + 1, name: jobRead.name });
    writeEvidence('I03A-authorities-http', {
      case: 'TC-API-listAuthorities / listAuthorityGroups / updateAuthorityMetadata',
      level: 'REAL_API_DB_REDIS (localhost HTTP)',
      authorities: codes.length,
      groups: groups.body.result.items.length,
      groupFieldsReturned: ['createdAt', 'id', 'name', 'updatedAt'],
    });
  });

  it('TC-API-deleteRole: version required, builtIn 409, then soft delete', async () => {
    expectError(
      await stack.http().delete(`${API}/roles/${customRoleId}`).set(as(admin)),
      422,
      'GATEWAY_REQUEST_INVALID',
    );
    const supervisor = await roleByName('SUPERVISOR');
    expectError(
      await stack
        .http()
        .delete(`${API}/roles/${supervisor.id}`)
        .query({ version: supervisor.version })
        .set(as(admin)),
      409,
      'RBAC_ROLE_BUILT_IN',
    );
    const current = await roleByName(customRoleName);
    const deleted = await stack
      .http()
      .delete(`${API}/roles/${customRoleId}`)
      .query({ version: current.version })
      .set(as(admin));
    expect(deleted.status).toBe(200);
    expect(deleted.body.result).toMatchObject({ id: customRoleId, status: 'DELETED' });
    expectError(
      await stack.http().get(`${API}/roles/${customRoleId}`).set(as(admin)),
      404,
      'RBAC_ROLE_NOT_FOUND',
    );
    expect((await roleByName(customRoleName)).deletedAt).not.toBeNull();
    writeEvidence('I03A-deleteRole-http', {
      case: 'TC-API-deleteRole',
      level: 'REAL_API_DB_REDIS (localhost HTTP)',
      builtIn: 'RBAC_ROLE_BUILT_IN',
      deleted: deleted.body.result.status,
    });
  });

  it('TC-DENY (9 ops): 401 without token, 403 for MANAGER_A (real non-SUPER_ADMIN actor) before any write', async () => {
    const adminRole = await roleByName('ADMIN');
    const jobRead = await stack.dataSource
      .getRepository(V1AuthorityRecord)
      .findOneOrFail({ where: { code: 'JOB_READ' } });
    const before = { role: adminRole.version, authority: jobRead.version };
    const routes: Array<[string, 'get' | 'patch' | 'delete' | 'put', string, object | undefined]> =
      [
        ['listRoles', 'get', '/roles', undefined],
        ['getRole', 'get', `/roles/${adminRole.id}`, undefined],
        [
          'updateRole',
          'patch',
          `/roles/${adminRole.id}`,
          { version: adminRole.version, description: 'x' },
        ],
        ['deleteRole', 'delete', `/roles/${adminRole.id}?version=${adminRole.version}`, undefined],
        ['listAuthorities', 'get', '/authorities', undefined],
        ['listAuthorityGroups', 'get', '/authority-groups', undefined],
        [
          'updateAuthorityMetadata',
          'patch',
          `/authorities/${jobRead.id}`,
          { version: jobRead.version, name: 'x' },
        ],
        ['putRoleAuthority', 'put', `/roles/${adminRole.id}/authorities/LOG_READ`, undefined],
        [
          'deleteRoleAuthority',
          'delete',
          `/roles/${adminRole.id}/authorities/LOG_READ?version=${adminRole.version}`,
          undefined,
        ],
      ];
    const outcomes: Array<{ operation: string; anonymous: string; missingAuthority: string }> = [];
    for (const [operation, method, path, body] of routes) {
      const send = (headers: Record<string, string>) => {
        const call = stack.http()[method](`${API}${path}`).set(headers);
        return body ? call.send(body) : call;
      };
      const anonymous = await send({});
      const denied = await send(as(manager));
      expectError(anonymous, 401, 'SESSION_ACCESS_TOKEN_MISSING');
      expectError(denied, 403, 'RBAC_PERMISSION_DENIED');
      outcomes.push({
        operation,
        anonymous: anonymous.body.errorKey,
        missingAuthority: denied.body.errorKey,
      });
    }
    expect((await roleByName('ADMIN')).version).toBe(before.role);
    expect(
      (
        await stack.dataSource
          .getRepository(V1AuthorityRecord)
          .findOneOrFail({ where: { code: 'JOB_READ' } })
      ).version,
    ).toBe(before.authority);
    writeEvidence('TC-DENY-rbac-http', {
      case: 'TC-DENY-<op> for 9 RBAC ops (401 anonymous, 403 MANAGER_A)',
      level: 'REAL_API_DB_REDIS (localhost HTTP)',
      outcomes,
      writesAfterDenied: 0,
    });
  });

  it('F-196-04: a real SUPER_ADMIN user is denied by v1 even when its role holds the code (no bypass)', async () => {
    const superAdmin = await roleByName('SUPER_ADMIN');
    expect(superAdmin.family).toBeNull();
    const roleRead = await stack.dataSource
      .getRepository(V1AuthorityRecord)
      .findOneOrFail({ where: { code: 'ROLE_READ' } });
    const password = `sa-${uuidv4()}`;
    const userId = uuidv4();
    const permissionId = uuidv4();
    await stack.dataSource.getRepository(User).insert({
      id: userId,
      slug: getRandomString(),
      phonenumber: '0911000049',
      firstName: 'E2E',
      lastName: 'SuperAdmin',
      password: await bcrypt.hash(password, 4),
      isActive: true,
      role: { id: superAdmin.id },
    });
    await stack.dataSource.getRepository(V1PermissionRecord).insert({
      id: permissionId,
      slug: getRandomString(),
      roleId: superAdmin.id,
      authorityId: roleRead.id,
      deletedAt: null,
    });
    try {
      const login = await stack
        .http()
        .post(`${API}/auth/login`)
        .set('X-Forwarded-For', '198.51.100.49')
        .send({ phoneNumber: '0911000049', password });
      expect(login.status).toBe(200);
      const denied = await stack.http().get(`${API}/roles`).set(as(login.body.result.accessToken));
      expectError(denied, 403, 'RBAC_FAMILY_UNRESOLVED');
      writeEvidence('I03A-F-196-04-http', {
        case: 'F-196-04 / DEV-196-03',
        level: 'REAL_API_DB_REDIS (localhost HTTP)',
        superAdminFamily: null,
        roleHeldCode: 'ROLE_READ',
        result: denied.body.errorKey,
      });
    } finally {
      await stack.dataSource.getRepository(V1PermissionRecord).delete({ id: Equal(permissionId) });
      await stack.dataSource.getRepository(User).delete({ id: Equal(userId) });
    }
  });
});
