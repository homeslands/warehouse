import { MigrationInterface, QueryRunner } from 'typeorm';
import { AuthorityCode } from 'src/authority/authority.constants';
import {
  AuthoritySeed,
  seedAuthorities,
  unseedAuthorities,
} from 'src/authority/authority-seed.util';
import { RoleEnum } from 'src/role/role.enum';

const GROUP = 'Store';

// `defaultRoles` chép đúng `@HasRole(...)` cũ trên controller để hành vi ngay sau migrate không đổi.
export const STORE_AUTHORITY_SEED: readonly AuthoritySeed[] = [
  {
    code: AuthorityCode.StoreCreate,
    name: 'Tạo cửa hàng',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.StoreRead,
    name: 'Xem cửa hàng',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.StoreUpdate,
    name: 'Sửa cửa hàng',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.StoreDelete,
    name: 'Xoá cửa hàng',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
];

/**
 * Seed authority CRUD cho cửa hàng (`src/store/`).
 */
export class SeedStoreAuthorities1783728000026 implements MigrationInterface {
  name = 'SeedStoreAuthorities1783728000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await seedAuthorities(queryRunner, STORE_AUTHORITY_SEED);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await unseedAuthorities(queryRunner, STORE_AUTHORITY_SEED);
  }
}
