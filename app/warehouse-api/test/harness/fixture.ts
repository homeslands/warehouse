import { hash } from 'bcrypt';
import { randomBytes } from 'crypto';
import { DataSource, EntityManager, In } from 'typeorm';
import { Role } from 'src/role/role.entity';
import { Permission } from 'src/permission/permission.entity';
import { User } from 'src/user/user.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { WarehouseMember } from 'src/warehouse/warehouse-member.entity';
import { Store } from 'src/store/store.entity';
import { RoleEnum } from 'src/role/role.enum';
import { AuthorityCode } from 'src/authority/authority.constants';

/**
 * Fixture WH-QA-FIXTURES-R2 (8 actor / 3 kho) chiếu xuống model LEGACY đang chạy. UUID/alias giữ
 * nguyên R2 để đối chiếu; những chỗ legacy không biểu diễn được được ghi ở `LEGACY_GAPS`, không
 * seed graph vi phạm ràng buộc để giả scope R2 đã hoạt động.
 */
export const FIXTURE_VERSION = 'WH-QA-FIXTURES-R2@legacy-adapter-1';

export type ActorAlias =
  | 'ADMIN'
  | 'MANAGER_AB'
  | 'MANAGER_A'
  | 'MANAGER_C'
  | 'SUP_A1'
  | 'SUP_A2'
  | 'SUP_B'
  | 'SUP_A_NO_EXPORT';
export type WarehouseAlias = 'A' | 'B' | 'C';

interface ActorSpec {
  alias: ActorAlias;
  id: string;
  /** Role legacy. Tên `E2E_*` là role riêng của harness (xem `HARNESS_ROLES`). */
  roleName: string;
  /** R2 dùng `phoneNumber` `+999…`; legacy `phonenumber` theo regex VN ⇒ dãy 0900000001–08. */
  phonenumber: string;
}

export const ACTORS: readonly ActorSpec[] = [
  {
    alias: 'ADMIN',
    id: '147c7338-1984-58da-8fca-c18a17d6c465',
    roleName: RoleEnum.Admin,
    phonenumber: '0900000001',
  },
  {
    alias: 'MANAGER_AB',
    id: '76791bfc-fd81-51a1-ba10-d875d9d1c998',
    roleName: RoleEnum.Manager,
    phonenumber: '0900000002',
  },
  {
    alias: 'MANAGER_A',
    id: 'f3c78733-0d19-5b92-8a52-03f467cffac2',
    roleName: RoleEnum.Manager,
    phonenumber: '0900000003',
  },
  {
    alias: 'MANAGER_C',
    id: '56d5f75c-6d2e-524b-a71c-48a9450f421c',
    roleName: RoleEnum.Manager,
    phonenumber: '0900000004',
  },
  {
    alias: 'SUP_A1',
    id: '6264cc1b-8fac-5a95-a50a-dad457762150',
    roleName: RoleEnum.Supervisor,
    phonenumber: '0900000005',
  },
  {
    alias: 'SUP_A2',
    id: '56cd37d9-7b94-5dba-9f2c-2c25c9175b33',
    roleName: RoleEnum.Supervisor,
    phonenumber: '0900000006',
  },
  {
    alias: 'SUP_B',
    id: '4ffe340a-d6e6-5dc6-9491-c8f1000f9ad6',
    roleName: RoleEnum.Supervisor,
    phonenumber: '0900000007',
  },
  {
    alias: 'SUP_A_NO_EXPORT',
    id: '620f42b5-7dd9-5f19-927d-5409866f6a5b',
    roleName: 'E2E_SUPERVISOR_NO_EXPORT',
    phonenumber: '0900000008',
  },
];

interface WarehouseSpec {
  alias: WarehouseAlias;
  id: string;
  slug: string;
  code: string;
  manager: ActorAlias;
  members: ActorAlias[];
  store?: { id: string; slug: string; code: string; name: string };
}

export const WAREHOUSES: readonly WarehouseSpec[] = [
  {
    alias: 'A',
    id: '84d7646c-8060-5cb2-b1a6-33092fe4725c',
    slug: 'e2e-wh-a',
    code: 'E2E-WH-A',
    manager: 'MANAGER_A',
    members: ['MANAGER_AB', 'SUP_A1', 'SUP_A2', 'SUP_A_NO_EXPORT'],
    store: {
      id: 'e2e00000-0000-4000-8000-000000000001',
      slug: 'e2e-store-1',
      code: 'E2E-STORE-1',
      name: 'E2E Store 1',
    },
  },
  {
    alias: 'B',
    id: '28809b69-be3b-5629-9e56-9eb318315d82',
    slug: 'e2e-wh-b',
    code: 'E2E-WH-B',
    manager: 'MANAGER_AB',
    members: ['SUP_B'],
  },
  {
    alias: 'C',
    id: '5c9e51e3-4f93-59ab-822c-f01f0ef3dd6a',
    slug: 'e2e-wh-c',
    code: 'E2E-WH-C',
    manager: 'MANAGER_C',
    members: [],
    store: {
      id: 'e2e00000-0000-4000-8000-000000000002',
      slug: 'e2e-store-2',
      code: 'E2E-STORE-2',
      name: 'E2E Store 2',
    },
  },
];

/**
 * Role riêng của harness (cùng `level` với SUPERVISOR), vì legacy gán quyền theo role chứ không theo user:
 * - `E2E_SUPERVISOR_NO_EXPORT`: SUPERVISOR − EXPORT_FORM_CREATE (fixture R2 `removedAuthorities`).
 * - `E2E_SUPERVISOR_NO_WH_READ_TC06`: thêm − WAREHOUSE_READ, chỉ gán trong W01-TC06 rồi reset.
 * Role SUPERVISOR dùng chung KHÔNG bị sửa.
 */
export const HARNESS_ROLES: Record<string, string[]> = {
  E2E_SUPERVISOR_NO_EXPORT: [AuthorityCode.ExportFormCreate],
  E2E_SUPERVISOR_NO_WH_READ_TC06: [AuthorityCode.ExportFormCreate, AuthorityCode.WarehouseRead],
};
export const TC06_ROLE = 'E2E_SUPERVISOR_NO_WH_READ_TC06';

export const LEGACY_GAPS = [
  'R2 cho nhiều manager/kho; legacy 1 `manager_id`/kho ⇒ MANAGER_AB là manager B + member A (GAP-W02).',
  'R2 STORE_1 sở hữu A+B; legacy Store↔Warehouse 1-1 ⇒ STORE_1↔A, STORE_2↔C, B không store (GAP-W02/W03).',
  'R2 removedAuthorities theo user; legacy theo role ⇒ role harness E2E_SUPERVISOR_NO_EXPORT (GAP-W02).',
  'R2 phoneNumber +999…; legacy phonenumber regex VN ⇒ 0900000001–08 (adapter).',
  'R2 fixture không cấp UUID store ⇒ harness tự đặt e2e00000-…-0001/0002 (không phải ID R2).',
];

export interface SeededFixture {
  version: string;
  /** Mật khẩu sinh mỗi lần seed, chỉ giữ trong bộ nhớ của process test. */
  passwords: Record<ActorAlias, string>;
  phonenumbers: Record<ActorAlias, string>;
  ids: Record<ActorAlias, string>;
  warehouseSlugs: Record<WarehouseAlias, string>;
}

const actorIds = () => ACTORS.map((actor) => actor.id);
const warehouseIds = () => WAREHOUSES.map((warehouse) => warehouse.id);
const storeIds = () =>
  WAREHOUSES.flatMap((warehouse) => (warehouse.store ? [warehouse.store.id] : []));

/**
 * Xoá đúng các row harness sở hữu (theo UUID/slug/tên role cố định), con trước cha. Không TRUNCATE,
 * không chạm row khác trong DB. Chỉ gọi sau khi target đã qua guard.
 */
export async function resetFixture(dataSource: DataSource): Promise<void> {
  await dataSource.transaction(async (manager) => {
    await manager
      .createQueryBuilder()
      .delete()
      .from(WarehouseMember)
      .where('warehouse_id_column IN (:...wh) OR user_id_column IN (:...users)', {
        wh: warehouseIds(),
        users: actorIds(),
      })
      .execute();
    await manager.delete(Store, { id: In(storeIds()) });
    await manager.delete(Warehouse, { id: In(warehouseIds()) });
    await manager.delete(User, { id: In(actorIds()) });
    const roles = await manager.find(Role, {
      where: { name: In(Object.keys(HARNESS_ROLES)) },
      withDeleted: true,
    });
    if (roles.length) {
      await manager.delete(Permission, { role: { id: In(roles.map((role) => role.id)) } });
      await manager.delete(Role, { id: In(roles.map((role) => role.id)) });
    }
  });
}

async function createHarnessRoles(manager: EntityManager): Promise<Record<string, Role>> {
  const supervisor = await manager.findOne(Role, {
    where: { name: RoleEnum.Supervisor },
    relations: { permissions: true },
  });
  if (!supervisor) throw new Error('SUPERVISOR role missing — run migrations first');
  const created: Record<string, Role> = {};
  for (const [name, removed] of Object.entries(HARNESS_ROLES)) {
    const role = await manager.save(
      manager.create(Role, {
        name,
        slug: name.toLowerCase().replace(/_/g, '-'),
        description: `e2e harness role (${FIXTURE_VERSION})`,
        level: supervisor.level,
      }),
    );
    const permissions = supervisor.permissions
      .filter((permission) => !removed.includes(permission.authority.code))
      .map((permission) =>
        manager.create(Permission, {
          slug: `${role.slug}-${permission.authority.code.toLowerCase()}`.slice(0, 255),
          role,
          authority: permission.authority,
        }),
      );
    await manager.save(permissions);
    created[name] = role;
  }
  return created;
}

/** Reset rồi seed lại toàn bộ fixture trong một transaction — chạy lặp không tạo trùng. */
export async function seedFixture(
  dataSource: DataSource,
  saltRounds: number,
): Promise<SeededFixture> {
  await resetFixture(dataSource);
  const passwords = {} as Record<ActorAlias, string>;
  const hashed = new Map<ActorAlias, string>();
  for (const actor of ACTORS) {
    passwords[actor.alias] = `E2e-${randomBytes(12).toString('base64url')}`;
    hashed.set(actor.alias, await hash(passwords[actor.alias], saltRounds));
  }

  await dataSource.transaction(async (manager) => {
    const harnessRoles = await createHarnessRoles(manager);
    const baseRoles = await manager.find(Role, {
      where: { name: In([RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor]) },
    });
    const roleByName = new Map<string, Role>([
      ...baseRoles.map((role) => [role.name, role] as const),
      ...Object.entries(harnessRoles),
    ]);

    const users = new Map<ActorAlias, User>();
    for (const actor of ACTORS) {
      const role = roleByName.get(actor.roleName);
      if (!role) throw new Error(`role ${actor.roleName} missing`);
      const user = await manager.save(
        manager.create(User, {
          id: actor.id,
          slug: `e2e-${actor.alias.toLowerCase().replace(/_/g, '-')}`,
          phonenumber: actor.phonenumber,
          firstName: actor.alias,
          lastName: 'E2E',
          password: hashed.get(actor.alias),
          isActive: true,
          role,
        }),
      );
      users.set(actor.alias, user);
    }

    for (const spec of WAREHOUSES) {
      const warehouse = await manager.save(
        manager.create(Warehouse, {
          id: spec.id,
          slug: spec.slug,
          code: spec.code,
          name: `E2E Warehouse ${spec.alias}`,
          address: `E2E address ${spec.alias}`,
          isActive: true,
          manager: users.get(spec.manager),
        }),
      );
      for (const alias of spec.members) {
        await manager.save(
          manager.create(WarehouseMember, {
            slug: `${spec.slug}-${alias.toLowerCase().replace(/_/g, '-')}`,
            warehouse,
            user: users.get(alias),
          }),
        );
      }
      if (spec.store) {
        await manager.save(
          manager.create(Store, {
            id: spec.store.id,
            slug: spec.store.slug,
            code: spec.store.code,
            name: spec.store.name,
            legalName: spec.store.name,
            taxCode: '0000000000',
            isActive: true,
            warehouse,
          }),
        );
      }
    }
  });

  const pick = <T>(fn: (actor: ActorSpec) => T) =>
    Object.fromEntries(ACTORS.map((actor) => [actor.alias, fn(actor)])) as Record<ActorAlias, T>;
  return {
    version: FIXTURE_VERSION,
    passwords,
    phonenumbers: pick((actor) => actor.phonenumber),
    ids: pick((actor) => actor.id),
    warehouseSlugs: Object.fromEntries(WAREHOUSES.map((w) => [w.alias, w.slug])) as Record<
      WarehouseAlias,
      string
    >,
  };
}

/** Đếm row harness sở hữu — dùng cho TC03 (seed/reset lặp không trùng). */
export async function countFixtureRows(dataSource: DataSource): Promise<Record<string, number>> {
  const harnessRoles = await dataSource
    .getRepository(Role)
    .find({ where: { name: In(Object.keys(HARNESS_ROLES)) }, withDeleted: true });
  return {
    users: await dataSource
      .getRepository(User)
      .count({ where: { id: In(actorIds()) }, withDeleted: true }),
    phonenumbers: await dataSource
      .getRepository(User)
      .count({ where: { phonenumber: In(ACTORS.map((a) => a.phonenumber)) }, withDeleted: true }),
    warehouses: await dataSource
      .getRepository(Warehouse)
      .count({ where: { id: In(warehouseIds()) }, withDeleted: true }),
    members: await dataSource
      .getRepository(WarehouseMember)
      .count({ where: { warehouse: { id: In(warehouseIds()) } }, withDeleted: true }),
    stores: await dataSource
      .getRepository(Store)
      .count({ where: { id: In(storeIds()) }, withDeleted: true }),
    harnessRoles: harnessRoles.length,
    harnessPermissions: harnessRoles.length
      ? await dataSource
          .getRepository(Permission)
          .count({ where: { role: { id: In(harnessRoles.map((r) => r.id)) } } })
      : 0,
  };
}
