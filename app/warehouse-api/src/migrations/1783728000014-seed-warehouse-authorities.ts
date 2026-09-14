import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { getRandomString } from 'src/app/app.subscriber';
import { AuthorityCode, TAuthorityCode } from 'src/authority/authority.constants';
import { RoleEnum } from 'src/role/role.enum';

const AuthorityGroupName = {
  Warehouse: 'Warehouse',
} as const;

interface AuthoritySeed {
  code: TAuthorityCode;
  name: string;
  group: string;
  /**
   * Quyậền cấp sẵn lúc seed, KHÔNG phải sự thật lúc chạy: sau khi migrate, nguồn sự thật là
   * `permission_tbl` (admin bt/tắt qua `PUT|DELETE /roles/:roleSlug/authorities/:authorityCode`).
   * Sửa mảng này không cấp thêm/thu hồi quyền cho DB đã seed.
   *
   * `SUPER_ADMIN` cố tình không xuất hiện ở đâu cả — nó bypass ngay trong `AuthorityGuard`.
   */
  defaultRoles: RoleEnum[];
}

export const WAREHOUSE_AUTHORITY_SEED: readonly AuthoritySeed[] = [
  {
    code: AuthorityCode.WarehouseCreate,
    name: 'Tạo kho',
    group: AuthorityGroupName.Warehouse,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.WarehouseRead,
    name: 'Xem danh sách/chi tiết kho',
    group: AuthorityGroupName.Warehouse,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.WarehouseUpdate,
    name: 'Sửa thông tin kho',
    group: AuthorityGroupName.Warehouse,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.WarehouseDelete,
    name: 'Xoá kho',
    group: AuthorityGroupName.Warehouse,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.WarehouseAssignManager,
    name: 'Phân công quản lý kho',
    group: AuthorityGroupName.Warehouse,
    defaultRoles: [RoleEnum.Admin],
  },
];

/**
 * Seed authority cho master data kho. Chỉ `code` lấy từ `src/authority/authority.constants.ts`
 * (khoá phải khớp `@RequireAuthority(...)` trong code), còn tên/nhóm/quyền cấp sẵn nằm ngay trong
 * file này vì đó là dữ liệu, không phải hằng của app.
 *
 * Idempotent ở mức row (kiểm tra tồn tại trước khi INSERT) để chạy lại sau `typeorm:rv` không vỡ vì
 * `code_column` unique, và để không đụng vào quyền admin đã bật/tắt tay qua API.
 */
export class SeedWarehouseAuthorities1783728000014 implements MigrationInterface {
  name = 'SeedWarehouseAuthorities1783728000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const groupIdByName = new Map<string, string>();
    for (const groupName of new Set(WAREHOUSE_AUTHORITY_SEED.map((item) => item.group))) {
      const [existing] = await queryRunner.query(
        `SELECT \`id_column\` AS id FROM \`authority_group_tbl\` WHERE \`name_column\` = ? LIMIT 1`,
        [groupName],
      );
      if (existing) {
        groupIdByName.set(groupName, existing.id);
        continue;
      }
      const id = uuidv4();
      await queryRunner.query(
        `INSERT INTO \`authority_group_tbl\` (\`id_column\`, \`slug_column\`, \`name_column\`)
         VALUES (?, ?, ?)`,
        [id, getRandomString(), groupName],
      );
      groupIdByName.set(groupName, id);
    }

    // 1 lần đọc cho toàn bộ role, thay vì 1 query mỗi authority × mỗi role.
    const roles: Array<{ id: string; name: string }> = await queryRunner.query(
      `SELECT \`id_column\` AS id, \`name_column\` AS name FROM \`role_tbl\``,
    );
    const roleIdByName = new Map(roles.map((role) => [role.name, role.id]));

    for (const authority of WAREHOUSE_AUTHORITY_SEED) {
      const [existing] = await queryRunner.query(
        `SELECT \`id_column\` AS id FROM \`authority_tbl\` WHERE \`code_column\` = ? LIMIT 1`,
        [authority.code],
      );
      let authorityId = existing?.id;
      if (!authorityId) {
        authorityId = uuidv4();
        await queryRunner.query(
          `INSERT INTO \`authority_tbl\`
             (\`id_column\`, \`slug_column\`, \`name_column\`, \`code_column\`, \`authority_group_id_column\`)
           VALUES (?, ?, ?, ?, ?)`,
          [
            authorityId,
            getRandomString(),
            authority.name,
            authority.code,
            groupIdByName.get(authority.group),
          ],
        );
      }

      for (const roleName of authority.defaultRoles) {
        const roleId = roleIdByName.get(roleName);
        // Role chưa seed (DB dựng tay, thiếu 1783728000004) thì bỏ qua thay vì gãy cả migration:
        // quyền đó bật lại được bất cứ lúc nào qua API permission.
        if (!roleId) continue;

        const [granted] = await queryRunner.query(
          `SELECT \`id_column\` AS id FROM \`permission_tbl\`
           WHERE \`role_id_column\` = ? AND \`authority_id_column\` = ? LIMIT 1`,
          [roleId, authorityId],
        );
        if (granted) continue;

        await queryRunner.query(
          `INSERT INTO \`permission_tbl\` (\`id_column\`, \`slug_column\`, \`role_id_column\`, \`authority_id_column\`)
           VALUES (?, ?, ?, ?)`,
          [uuidv4(), getRandomString(), roleId, authorityId],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const codes = WAREHOUSE_AUTHORITY_SEED.map((authority) => authority.code);
    const codePlaceholders = codes.map(() => '?').join(', ');

    await queryRunner.query(
      `DELETE FROM \`permission_tbl\` WHERE \`authority_id_column\` IN
        (SELECT \`id_column\` FROM \`authority_tbl\` WHERE \`code_column\` IN (${codePlaceholders}))`,
      codes,
    );
    await queryRunner.query(
      `DELETE FROM \`authority_tbl\` WHERE \`code_column\` IN (${codePlaceholders})`,
      codes,
    );

    // Chỉ xoá group đã rỗng: group có thể đã được migration/feature khác dùng chung, xoá thẳng theo
    // tên sẽ kéo theo authority của người khác qua `ON DELETE CASCADE`.
    const groupNames = [...new Set(WAREHOUSE_AUTHORITY_SEED.map((item) => item.group))];
    const groupPlaceholders = groupNames.map(() => '?').join(', ');
    await queryRunner.query(
      `DELETE FROM \`authority_group_tbl\`
       WHERE \`name_column\` IN (${groupPlaceholders})
         AND \`id_column\` NOT IN (SELECT \`authority_group_id_column\` FROM \`authority_tbl\`)`,
      groupNames,
    );
  }
}
