import { MigrationInterface, QueryRunner } from 'typeorm';
import { AuthorityCode } from 'src/authority/authority.constants';
import {
  AuthoritySeed,
  seedAuthorities,
  unseedAuthorities,
} from 'src/authority/authority-seed.util';
import { RoleEnum } from 'src/role/role.enum';

// Trùng tên group của 1783728000010 để `seedAuthorities` dùng lại group cũ, không đẻ group thứ 2.
const GROUP = 'User Management';

/**
 * `USER_CREATE` đã được 1783728000010 seed — khai lại ở đây chỉ để chắc chắn `ADMIN` có quyền (util
 * idempotent: code/permission đã tồn tại thì bỏ qua, không đụng quyền đã bật/tắt tay qua API).
 */
const USER_CREATE_SEED: AuthoritySeed = {
  code: AuthorityCode.UserCreate,
  name: 'Create user',
  group: GROUP,
  defaultRoles: [RoleEnum.Admin],
};

// `PATCH /users/{slug}`, `DELETE /users/{slug}` (khoá), `POST /users/{slug}/change-role`.
const USER_UPDATE_SEED: AuthoritySeed = {
  code: AuthorityCode.UserUpdate,
  name: 'Update / lock user, change user role',
  group: GROUP,
  defaultRoles: [RoleEnum.Admin],
};

export const USER_AUTHORITY_SEED: readonly AuthoritySeed[] = [USER_CREATE_SEED, USER_UPDATE_SEED];

/**
 * Seed authority tạo/sửa user (`src/user/`).
 */
export class SeedUserUpdateAuthorities1783728000035 implements MigrationInterface {
  name = 'SeedUserUpdateAuthorities1783728000035';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await seedAuthorities(queryRunner, USER_AUTHORITY_SEED);
  }

  // Chỉ gỡ `USER_UPDATE`: `USER_CREATE` thuộc 1783728000010, gỡ ở đây là revert 1 migration làm
  // `ADMIN` mất luôn quyền `POST /users`.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await unseedAuthorities(queryRunner, [USER_UPDATE_SEED]);
  }
}
