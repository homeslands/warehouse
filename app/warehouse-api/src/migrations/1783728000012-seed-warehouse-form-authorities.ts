import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { getRandomString } from 'src/app/app.subscriber';
import { AuthorityCode, TAuthorityCode } from 'src/authority/authority.constants';
import { RoleEnum } from 'src/role/role.enum';

const AuthorityGroupName = {
  ImportForm: 'Import Form',
  ExportForm: 'Export Form',
  BalanceForm: 'Balance Form',
  WarehousePayment: 'Warehouse Payment',
} as const;

interface AuthoritySeed {
  code: TAuthorityCode;
  /** Tên hiển thị trên UI quản trị permission. Sửa được sau qua `PATCH /authorities/:slug`. */
  name: string;
  group: string;
  /**
   * Quyền cấp sẵn lúc seed, KHÔNG phải sự thật lúc chạy: sau khi migrate, nguồn sự thật là
   * `permission_tbl` (admin bật/tắt qua `PUT|DELETE /roles/:roleSlug/authorities/:authorityCode`).
   * Sửa mảng này không cấp thêm/thu hồi quyền cho DB đã seed.
   *
   * `SUPER_ADMIN` cố tình không xuất hiện ở đâu cả — nó bypass ngay trong `AuthorityGuard`, cấp row
   * `permission_tbl` cho nó là thừa (xem migration `1783728000011`).
   */
  defaultRoles: RoleEnum[];
}

/**
 * Bảng phân quyền 5.5 dịch nguyên văn sang authority. 2 nhóm ô KHÔNG có mặt ở đây, cố ý:
 *
 * 1. "Sửa Confirmed" / "Xóa Confirmed" — ✗ với cả 3 role. Đây là bất biến nghiệp vụ (phiếu đã chốt
 *    thì bất biến), không phải quyền đang tắt. Nếu tạo `code` cho chúng rồi để 0 role, admin vẫn
 *    bật được qua API permission và phá luôn bất biến — nên phải chặn ở service/state machine, và
 *    cách chặn chắc nhất là không tồn tại `code` để mà bật.
 * 2. "Tạo từ nhập kho (auto)" (WarehousePayment) — ✓ với cả 3 role, nhưng đó là phiếu do HỆ THỐNG
 *    sinh kèm khi phiếu nhập được tạo/xác nhận, không phải 1 endpoint người dùng gọi. Quyền quyết
 *    định thực chất là quyền trên phiếu nhập, nên không có authority riêng.
 *
 * Ô "✓ (người duyệt)" của MANAGER ở "Phê duyệt/Confirm" phiếu chi: MANAGER có
 * `WAREHOUSE_PAYMENT_APPROVE`, còn ràng buộc "phải đúng người được chỉ định duyệt phiếu này" là
 * check row-level ở service — guard không nhìn thấy dữ liệu phiếu nên không kiểm được.
 *
 * Export ra ngoài chỉ để spec cùng tên kiểm tra tính nhất quán (trùng `code`, thiếu/thừa so với
 * `AuthorityCode`, cấp nhầm `SUPER_ADMIN`) — không nơi nào khác được import mảng này lúc runtime.
 */
export const WAREHOUSE_FORM_AUTHORITY_SEED: readonly AuthoritySeed[] = [
  // ================= Phiếu nhập kho =================
  {
    code: AuthorityCode.ImportFormCreate,
    name: 'Tạo phiếu nhập kho',
    group: AuthorityGroupName.ImportForm,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.ImportFormRead,
    name: 'Xem phiếu nhập kho',
    group: AuthorityGroupName.ImportForm,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.ImportFormUpdateDraft,
    name: 'Sửa phiếu nhập kho nháp (mọi phiếu)',
    group: AuthorityGroupName.ImportForm,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.ImportFormUpdateDraftOwn,
    name: 'Sửa phiếu nhập kho nháp của mình',
    group: AuthorityGroupName.ImportForm,
    defaultRoles: [RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.ImportFormDeleteDraft,
    name: 'Xoá phiếu nhập kho nháp (mọi phiếu)',
    group: AuthorityGroupName.ImportForm,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager],
  },
  {
    code: AuthorityCode.ImportFormDeleteDraftOwn,
    name: 'Xoá phiếu nhập kho nháp của mình',
    group: AuthorityGroupName.ImportForm,
    defaultRoles: [RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.ImportFormConfirm,
    name: 'Xác nhận phiếu nhập kho',
    group: AuthorityGroupName.ImportForm,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager],
  },
  {
    code: AuthorityCode.ImportFormExport,
    name: 'In/xuất file phiếu nhập kho',
    group: AuthorityGroupName.ImportForm,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor],
  },

  // ================= Phiếu xuất kho =================
  {
    code: AuthorityCode.ExportFormCreate,
    name: 'Tạo phiếu xuất kho',
    group: AuthorityGroupName.ExportForm,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.ExportFormRead,
    name: 'Xem phiếu xuất kho',
    group: AuthorityGroupName.ExportForm,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.ExportFormUpdateDraft,
    name: 'Sửa phiếu xuất kho nháp (mọi phiếu)',
    group: AuthorityGroupName.ExportForm,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.ExportFormUpdateDraftOwn,
    name: 'Sửa phiếu xuất kho nháp của mình',
    group: AuthorityGroupName.ExportForm,
    defaultRoles: [RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.ExportFormDeleteDraft,
    name: 'Xoá phiếu xuất kho nháp (mọi phiếu)',
    group: AuthorityGroupName.ExportForm,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager],
  },
  {
    code: AuthorityCode.ExportFormDeleteDraftOwn,
    name: 'Xoá phiếu xuất kho nháp của mình',
    group: AuthorityGroupName.ExportForm,
    defaultRoles: [RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.ExportFormConfirm,
    name: 'Xác nhận phiếu xuất kho',
    group: AuthorityGroupName.ExportForm,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager],
  },
  {
    code: AuthorityCode.ExportFormExport,
    name: 'In/xuất file phiếu xuất kho',
    group: AuthorityGroupName.ExportForm,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor],
  },
  {
    // SUPERVISOR chỉ được TẠO phiếu xuất hủy (đã có `EXPORT_FORM_CREATE`), không được tự duyệt.
    code: AuthorityCode.ExportFormApproveDisposal,
    name: 'Phê duyệt phiếu xuất hủy',
    group: AuthorityGroupName.ExportForm,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager],
  },

  // ================= Phiếu kiểm kho =================
  {
    code: AuthorityCode.BalanceFormCreate,
    name: 'Tạo phiếu kiểm kho',
    group: AuthorityGroupName.BalanceForm,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.BalanceFormRead,
    name: 'Xem mọi phiếu kiểm kho',
    group: AuthorityGroupName.BalanceForm,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager],
  },
  {
    code: AuthorityCode.BalanceFormReadAssigned,
    name: 'Xem phiếu kiểm kho được phân công',
    group: AuthorityGroupName.BalanceForm,
    defaultRoles: [RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.BalanceFormRecordCount,
    name: 'Nhập số liệu kiểm kho (mọi phiếu)',
    group: AuthorityGroupName.BalanceForm,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.BalanceFormRecordCountAssigned,
    name: 'Nhập số liệu phiếu kiểm kho được phân công',
    group: AuthorityGroupName.BalanceForm,
    defaultRoles: [RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.BalanceFormComplete,
    name: 'Hoàn thành kiểm kho (mọi phiếu)',
    group: AuthorityGroupName.BalanceForm,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.BalanceFormCompleteAssigned,
    name: 'Hoàn thành phiếu kiểm kho được phân công',
    group: AuthorityGroupName.BalanceForm,
    defaultRoles: [RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.BalanceFormApprove,
    name: 'Phê duyệt phiếu kiểm kho',
    group: AuthorityGroupName.BalanceForm,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager],
  },

  // ================= Phiếu chi kho =================
  {
    code: AuthorityCode.WarehousePaymentCreate,
    name: 'Tạo phiếu chi kho thủ công',
    group: AuthorityGroupName.WarehousePayment,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.WarehousePaymentRead,
    name: 'Xem mọi phiếu chi kho',
    group: AuthorityGroupName.WarehousePayment,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager],
  },
  {
    code: AuthorityCode.WarehousePaymentReadOwn,
    name: 'Xem phiếu chi kho của mình',
    group: AuthorityGroupName.WarehousePayment,
    defaultRoles: [RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.WarehousePaymentUpdateDraft,
    name: 'Sửa phiếu chi kho nháp (mọi phiếu)',
    group: AuthorityGroupName.WarehousePayment,
    defaultRoles: [RoleEnum.Admin],
  },
  {
    code: AuthorityCode.WarehousePaymentUpdateDraftOwn,
    name: 'Sửa phiếu chi kho nháp của mình',
    group: AuthorityGroupName.WarehousePayment,
    defaultRoles: [RoleEnum.Supervisor],
  },
  {
    code: AuthorityCode.WarehousePaymentApprove,
    name: 'Phê duyệt phiếu chi kho',
    group: AuthorityGroupName.WarehousePayment,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager],
  },
  {
    code: AuthorityCode.WarehousePaymentExport,
    name: 'In/xuất file phiếu chi kho',
    group: AuthorityGroupName.WarehousePayment,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor],
  },
];

/**
 * Seed authority cho 4 loại phiếu kho (nhập/xuất/kiểm/chi) theo bảng phân quyền 5.5. Chỉ `code` lấy
 * từ `src/authority/authority.constants.ts` (khoá phải khớp `@RequireAuthority(...)` trong code),
 * còn tên/nhóm/quyền cấp sẵn nằm ngay trong file này vì đó là dữ liệu, không phải hằng của app.
 *
 * Idempotent ở mức row (kiểm tra tồn tại trước khi INSERT) để chạy lại sau `typeorm:rv` không vỡ vì
 * `code_column` unique, và để không đụng vào quyền admin đã bật/tắt tay qua API.
 */
export class SeedWarehouseFormAuthorities1783728000012 implements MigrationInterface {
  name = 'SeedWarehouseFormAuthorities1783728000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const groupIdByName = new Map<string, string>();
    for (const groupName of new Set(WAREHOUSE_FORM_AUTHORITY_SEED.map((item) => item.group))) {
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

    for (const authority of WAREHOUSE_FORM_AUTHORITY_SEED) {
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
    const codes = WAREHOUSE_FORM_AUTHORITY_SEED.map((authority) => authority.code);
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
    const groupNames = [...new Set(WAREHOUSE_FORM_AUTHORITY_SEED.map((item) => item.group))];
    const groupPlaceholders = groupNames.map(() => '?').join(', ');
    await queryRunner.query(
      `DELETE FROM \`authority_group_tbl\`
       WHERE \`name_column\` IN (${groupPlaceholders})
         AND \`id_column\` NOT IN (SELECT \`authority_group_id_column\` FROM \`authority_tbl\`)`,
      groupNames,
    );
  }
}
