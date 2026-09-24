import { MigrationInterface, QueryRunner } from 'typeorm';
import { AuthorityCode } from 'src/authority/authority.constants';
import {
  AuthoritySeed,
  seedAuthorities,
  unseedAuthorities,
} from 'src/authority/authority-seed.util';
import { RoleEnum } from 'src/role/role.enum';

const GROUP = 'Tax Profile';

// `defaultRoles` chép đúng `@HasRole(...)` cũ trên controller để hành vi ngay sau migrate không đổi.
export const TAX_PROFILE_AUTHORITY_SEED: readonly AuthoritySeed[] = [
  {
    code: AuthorityCode.TaxProfileRead,
    name: 'Xem/tra cứu hồ sơ mã số thuế',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.TaxProfileUpdate,
    name: 'Làm mới hồ sơ mã số thuế từ nguồn bên ngoài',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
];

/**
 * Seed authority CRUD cho hồ sơ mã số thuế (`src/tax-profile/`).
 */
export class SeedTaxProfileAuthorities1783728000027 implements MigrationInterface {
  name = 'SeedTaxProfileAuthorities1783728000027';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await seedAuthorities(queryRunner, TAX_PROFILE_AUTHORITY_SEED);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await unseedAuthorities(queryRunner, TAX_PROFILE_AUTHORITY_SEED);
  }
}
