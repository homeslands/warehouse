import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  AuthoritySeed,
  seedAuthorities,
  unseedAuthorities,
} from 'src/authority/authority-seed.util';
import { RoleEnum } from 'src/role/role.enum';

/**
 * 6 mã quyền R2 mới (#196 mục 3; permission-policy `default_grant_families`). Không có trong `AuthorityCode`
 * legacy (chưa route legacy nào dùng) ⇒ ép kiểu ở đây: `AuthoritySeed.code` của util legacy chỉ nhận mã đã
 * dùng trong `@RequireAuthority`, còn các mã này chỉ do Storage v1 kiểm (`src/rbac-v1/`).
 * Nhóm hiển thị dùng lại nhóm sẵn có (`User Management`, `File`, `System` — cùng nhóm với DB_BACKUP/LOGGER_READ).
 * `LOG_READ` chỉ cấp ADMIN theo policy — KHÔNG sao chép từ role đang có LOGGER_READ (#196 mục 3).
 */
const V1_AUTHORITY_SEED = [
  {
    code: 'USER_CHANGE_ROLE',
    name: 'Đổi role của user',
    group: 'User Management',
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: 'FILE_READ',
    name: 'Xem metadata/tải file',
    group: 'File',
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor],
  },
  {
    code: 'AUDIT_READ',
    name: 'Xem audit nghiệp vụ',
    group: 'System',
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager],
  },
  { code: 'LOG_READ', name: 'Xem log kỹ thuật', group: 'System', defaultRoles: [RoleEnum.Admin] },
  {
    code: 'BACKUP_MANAGE',
    name: 'Quản lý backup/restore',
    group: 'System',
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: 'JOB_READ',
    name: 'Xem trạng thái job',
    group: 'System',
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor],
  },
] as unknown as readonly AuthoritySeed[];

/** 3 role seed có family cùng tên (#196 mục 5b bước 4). */
const FAMILY_ROLES = ['ADMIN', 'MANAGER', 'SUPERVISOR'];
/** 4 role seed `1783728000004` là builtIn. */
const BUILT_IN_ROLES = [...FAMILY_ROLES, 'SUPER_ADMIN'];

/**
 * W02 I-03a — phase **expand + backfill** cho RBAC v1 (data-and-migration §65-74; #196 mục 5, 5b):
 * - `role_tbl`: `version_column` (NOT NULL DEFAULT 1 ⇒ mọi row cũ = 1), `family_column` NULL + CHECK 3 giá
 *   trị, `built_in_column` NOT NULL DEFAULT 0.
 *   Backfill: ADMIN/MANAGER/SUPERVISOR ⇒ family cùng tên; 4 role seed ⇒ builtIn = 1.
 *   **Không tự gán family** cho `SUPER_ADMIN` (DEV-196-03) và cho role custom (data-and-migration §70): giữ NULL
 *   = "chờ đối soát". Storage v1 từ chối mọi quyền của role family NULL (fail-closed). Owner gán family cho
 *   từng role custom bằng migration/CR riêng sau khi xác nhận danh sách (query đối soát ở handoff I-03a).
 * - `user_tbl`, `authority_tbl`: `version_column` NOT NULL DEFAULT 1. `authority_tbl.fixed_invariant_column`
 *   NOT NULL DEFAULT 0 (OpenAPI `Authority.fixedInvariant`; R2 chưa nói mã nào là invariant — Q-I03-02).
 * - Seed 6 mã quyền mới + cấp theo `default_grant_families`.
 * - Chưa thêm NOT NULL cho family, chưa unique `roles.name` (phase constrain sau đối soát).
 * - Cache epoch (DEV-196-04): dùng `role_tbl.version_column` (tăng khi đổi quyền của role) — không cột riêng.
 *
 * **down:** unseed 6 mã, DROP các cột mới. Chỉ hợp lệ trước khi bật capability v1 (đã có dữ liệu v1 ⇒
 * forward-fix). Revert DB có sẵn cần quyền riêng.
 */
export class ExpandRbacV11783728000049 implements MigrationInterface {
  name = 'ExpandRbacV11783728000049';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`role_tbl\`
        ADD COLUMN \`version_column\` INT NOT NULL DEFAULT 1,
        ADD COLUMN \`family_column\` VARCHAR(16) NULL,
        ADD COLUMN \`built_in_column\` TINYINT NOT NULL DEFAULT 0,
        ADD CONSTRAINT \`CHK_role_family\`
          CHECK (\`family_column\` IS NULL OR \`family_column\` IN ('ADMIN', 'MANAGER', 'SUPERVISOR'));
    `);
    await queryRunner.query(
      `UPDATE \`role_tbl\` SET \`family_column\` = \`name_column\`
        WHERE \`name_column\` IN (?, ?, ?)`,
      FAMILY_ROLES,
    );
    await queryRunner.query(
      `UPDATE \`role_tbl\` SET \`built_in_column\` = 1 WHERE \`name_column\` IN (?, ?, ?, ?)`,
      BUILT_IN_ROLES,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_tbl\` ADD COLUMN \`version_column\` INT NOT NULL DEFAULT 1;`,
    );
    await queryRunner.query(`
      ALTER TABLE \`authority_tbl\`
        ADD COLUMN \`version_column\` INT NOT NULL DEFAULT 1,
        ADD COLUMN \`fixed_invariant_column\` TINYINT NOT NULL DEFAULT 0;
    `);
    await seedAuthorities(queryRunner, V1_AUTHORITY_SEED);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await unseedAuthorities(queryRunner, V1_AUTHORITY_SEED);
    await queryRunner.query(`
      ALTER TABLE \`authority_tbl\` DROP COLUMN \`fixed_invariant_column\`, DROP COLUMN \`version_column\`;
    `);
    await queryRunner.query(`ALTER TABLE \`user_tbl\` DROP COLUMN \`version_column\`;`);
    await queryRunner.query(`
      ALTER TABLE \`role_tbl\`
        DROP CHECK \`CHK_role_family\`,
        DROP COLUMN \`built_in_column\`,
        DROP COLUMN \`family_column\`,
        DROP COLUMN \`version_column\`;
    `);
  }
}
