import { MigrationInterface, QueryRunner } from 'typeorm';
import { AuthorityCode, NON_DELEGABLE_AUTHORITY_CODES } from 'src/authority/authority.constants';
import {
  AuthoritySeed,
  seedAuthorities,
  unseedAuthorities,
} from 'src/authority/authority-seed.util';
import { RoleEnum } from 'src/role/role.enum';

const GROUP = 'Role';

// Chỉ `ADMIN` được cấp sẵn cả 4 quyền. Kèm rào cấp (`RoleService.assertCanManage`): ADMIN chỉ
// thao tác được role có `level` thấp hơn mình.
export const ROLE_AUTHORITY_SEED: readonly AuthoritySeed[] = [
  {
    code: AuthorityCode.RoleCreate,
    name: 'Tạo vai trò',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.RoleRead,
    name: 'Xem vai trò',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.RoleUpdate,
    name: 'Sửa vai trò',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.RoleDelete,
    name: 'Xoá vai trò',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin],
  },
];

/**
 * Seed authority CRUD cho role (`src/role/`), rồi gỡ mọi quyền quản trị phân quyền
 * (`NON_DELEGABLE_AUTHORITY_CODES`) đang nằm ở role khác `ADMIN` — trước migration này API cho phép
 * ADMIN uỷ `MANAGE_PERMISSIONS` xuống dưới, từ giờ `PermissionService.grant` chặn.
 *
 * `down` không khôi phục các grant đã gỡ (không biết đã có những gì); cấp lại được qua API nếu cần.
 * Sau khi chạy phải xoá key `rbac:*` trên Redis, không thì role vừa bị gỡ vẫn giữ quyền tới hết TTL.
 */
export class SeedRoleAuthorities1783728000029 implements MigrationInterface {
  name = 'SeedRoleAuthorities1783728000029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await seedAuthorities(queryRunner, ROLE_AUTHORITY_SEED);

    const placeholders = NON_DELEGABLE_AUTHORITY_CODES.map(() => '?').join(', ');
    await queryRunner.query(
      `DELETE p FROM \`permission_tbl\` p
         JOIN \`authority_tbl\` a ON a.\`id_column\` = p.\`authority_id_column\`
         JOIN \`role_tbl\` r ON r.\`id_column\` = p.\`role_id_column\`
       WHERE a.\`code_column\` IN (${placeholders}) AND r.\`name_column\` <> ?`,
      [...NON_DELEGABLE_AUTHORITY_CODES, RoleEnum.Admin],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await unseedAuthorities(queryRunner, ROLE_AUTHORITY_SEED);
  }
}
