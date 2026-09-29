import { MigrationInterface, QueryRunner } from 'typeorm';
import { AuthorityCode } from 'src/authority/authority.constants';
import {
  AuthoritySeed,
  seedAuthorities,
  unseedAuthorities,
} from 'src/authority/authority-seed.util';
import { RoleEnum } from 'src/role/role.enum';

const GROUP = 'Unit';

// `defaultRoles` chép đúng `@HasRole(...)` cũ trên controller để hành vi ngay sau migrate không đổi.
export const UNIT_AUTHORITY_SEED: readonly AuthoritySeed[] = [
  {
    code: AuthorityCode.UnitCreate,
    name: 'Tạo đơn vị tính',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.UnitRead,
    name: 'Xem đơn vị tính',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.UnitUpdate,
    name: 'Sửa đơn vị tính',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.UnitDelete,
    name: 'Xoá đơn vị tính',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
];

/**
 * Seed authority CRUD cho đơn vị tính (`src/unit/`).
 */
export class SeedUnitAuthorities1783728000024 implements MigrationInterface {
  name = 'SeedUnitAuthorities1783728000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await seedAuthorities(queryRunner, UNIT_AUTHORITY_SEED);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await unseedAuthorities(queryRunner, UNIT_AUTHORITY_SEED);
  }
}
