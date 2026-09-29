import { MigrationInterface, QueryRunner } from 'typeorm';
import { AuthorityCode } from 'src/authority/authority.constants';
import {
  AuthoritySeed,
  seedAuthorities,
  unseedAuthorities,
} from 'src/authority/authority-seed.util';
import { RoleEnum } from 'src/role/role.enum';

const GROUP = 'Supplier';

export const SUPPLIER_AUTHORITY_SEED: readonly AuthoritySeed[] = [
  {
    code: AuthorityCode.SupplierCreate,
    name: 'Tạo nhà cung cấp',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.SupplierRead,
    name: 'Xem nhà cung cấp và lịch sử giao dịch',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.SupplierUpdate,
    name: 'Sửa nhà cung cấp / ghi giao dịch nhà cung cấp',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.SupplierDelete,
    name: 'Xoá nhà cung cấp',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
];

/**
 * Seed authority CRUD cho nhà cung cấp (`src/supplier/`).
 */
export class SeedSupplierAuthorities1783728000032 implements MigrationInterface {
  name = 'SeedSupplierAuthorities1783728000032';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await seedAuthorities(queryRunner, SUPPLIER_AUTHORITY_SEED);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await unseedAuthorities(queryRunner, SUPPLIER_AUTHORITY_SEED);
  }
}
