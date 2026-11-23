import { MigrationInterface, QueryRunner } from 'typeorm';
import { AuthorityCode } from 'src/authority/authority.constants';
import {
  AuthoritySeed,
  seedAuthorities,
  unseedAuthorities,
} from 'src/authority/authority-seed.util';
import { RoleEnum } from 'src/role/role.enum';

const GROUP = 'CodeRule';

// Chỉ READ/UPDATE: quy tắc sinh mã không tạo/xoá qua API (seed sẵn ở migration `1783728000049`).
export const CODE_RULE_AUTHORITY_SEED: readonly AuthoritySeed[] = [
  {
    code: AuthorityCode.CodeRuleRead,
    name: 'Xem quy tắc sinh mã',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager],
  },
  {
    code: AuthorityCode.CodeRuleUpdate,
    name: 'Sửa quy tắc sinh mã',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
];

/**
 * Seed authority cho quy tắc sinh mã (`src/code-generate/code-rule.controller.ts`).
 */
export class SeedCodeRuleAuthorities1783728000051 implements MigrationInterface {
  name = 'SeedCodeRuleAuthorities1783728000051';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await seedAuthorities(queryRunner, CODE_RULE_AUTHORITY_SEED);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await unseedAuthorities(queryRunner, CODE_RULE_AUTHORITY_SEED);
  }
}
