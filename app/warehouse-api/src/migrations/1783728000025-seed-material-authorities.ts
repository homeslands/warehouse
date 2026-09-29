import { MigrationInterface, QueryRunner } from 'typeorm';
import { AuthorityCode } from 'src/authority/authority.constants';
import {
  AuthoritySeed,
  seedAuthorities,
  unseedAuthorities,
} from 'src/authority/authority-seed.util';
import { RoleEnum } from 'src/role/role.enum';

const GROUP = 'Material';

// `defaultRoles` chép đúng `@HasRole(...)` cũ trên controller để hành vi ngay sau migrate không đổi.
export const MATERIAL_AUTHORITY_SEED: readonly AuthoritySeed[] = [
  {
    code: AuthorityCode.MaterialCreate,
    name: 'Tạo vật tư/loại vật tư',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.MaterialRead,
    name: 'Xem vật tư/loại vật tư',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.MaterialUpdate,
    name: 'Sửa vật tư/loại vật tư',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.MaterialDelete,
    name: 'Xoá vật tư/loại vật tư',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
];

/**
 * Seed authority CRUD cho vật tư — dùng chung cho `src/material/` lẫn `src/material-type/`; route nối sang đơn vị tính/kho
 * kết hợp thêm `UNIT_*`/`WAREHOUSE_*`.
 */
export class SeedMaterialAuthorities1783728000025 implements MigrationInterface {
  name = 'SeedMaterialAuthorities1783728000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await seedAuthorities(queryRunner, MATERIAL_AUTHORITY_SEED);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await unseedAuthorities(queryRunner, MATERIAL_AUTHORITY_SEED);
  }
}
