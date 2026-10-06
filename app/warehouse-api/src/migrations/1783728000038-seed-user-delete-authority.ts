import { MigrationInterface, QueryRunner } from 'typeorm';
import { AuthorityCode } from 'src/authority/authority.constants';
import {
  AuthoritySeed,
  seedAuthorities,
  unseedAuthorities,
} from 'src/authority/authority-seed.util';
import { RoleEnum } from 'src/role/role.enum';

// Trùng tên group của 1783728000010/035 để `seedAuthorities` dùng lại group cũ.
const GROUP = 'User Management';

// `DELETE /users/{slug}` — xoá mềm user (trước đây route này là khoá, nay chuyển sang `PUT .../lock`).
export const USER_DELETE_AUTHORITY_SEED: readonly AuthoritySeed[] = [
  {
    code: AuthorityCode.UserDelete,
    name: 'Delete user',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
];

export class SeedUserDeleteAuthority1783728000038 implements MigrationInterface {
  name = 'SeedUserDeleteAuthority1783728000038';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await seedAuthorities(queryRunner, USER_DELETE_AUTHORITY_SEED);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await unseedAuthorities(queryRunner, USER_DELETE_AUTHORITY_SEED);
  }
}
