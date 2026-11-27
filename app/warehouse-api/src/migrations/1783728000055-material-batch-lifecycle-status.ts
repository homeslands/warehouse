import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trạng thái lô theo vòng đời (spec 2.9.5, `MaterialBatchStatus`): `status_column` TINYINT `0`/`1`
 * ⇒ VARCHAR(16) (`PENDING`/`IN_STOCK`/`RESERVED`/`IN_TRANSIT`/`ISSUED`/`DISPOSED`/`RETURNED`/
 * `MISSING`/`VOID`). Index FEFO (kho, vật tư, trạng thái, hạn dùng) giữ nguyên.
 *
 * Đồng thời phiếu xuất đổi thời điểm giữ chỗ: từ lúc gửi duyệt sang lúc hàng vào phiếu NHÁP. Phiếu
 * nháp có trước migration chưa giữ gì ⇒ code mới sẽ "trả lại" phần chưa từng giữ khi huỷ/xoá/sửa dòng
 * (`MATERIAL_BATCH_RESERVED_INVALID`). Không backfill giữ chỗ bằng SQL (FEFO + tách dòng chỉ có ở
 * service) — migration TỪ CHỐI chạy khi còn phiếu xuất nháp có dòng; gửi duyệt hoặc xoá chúng trước.
 *
 * Backfill trạng thái: còn hàng ⇒ `RESERVED` nếu phần còn lại đã bị giữ hết, ngược lại `IN_STOCK`;
 * hết hàng ⇒ theo lý do của phiếu xuất ĐÃ XÁC NHẬN gần nhất lấy từ lô (`DISPOSAL` ⇒ `DISPOSED`,
 * `TRANSFER` ⇒ `IN_TRANSIT`, còn lại / không tra được ⇒ `ISSUED`).
 *
 * Viết tay vì `typeorm:g` không dùng được trên repo này (xem CLAUDE.md).
 */
export class MaterialBatchLifecycleStatus1783728000055 implements MigrationInterface {
  name = 'MaterialBatchLifecycleStatus1783728000055';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertNoDraftExportFormWithItems(queryRunner);

    await queryRunner.query(`
      ALTER TABLE \`material_batch_tbl\`
        MODIFY \`status_column\` VARCHAR(16) NOT NULL DEFAULT 'IN_STOCK';
    `);
    await queryRunner.query(`
      UPDATE \`material_batch_tbl\`
      SET \`status_column\` = CASE
        WHEN \`remaining_quantity_column\` > 0
          AND \`reserved_quantity_column\` >= \`remaining_quantity_column\` THEN 'RESERVED'
        WHEN \`remaining_quantity_column\` > 0 THEN 'IN_STOCK'
        ELSE 'ISSUED'
      END;
    `);
    await queryRunner.query(`
      UPDATE \`material_batch_tbl\` b
      JOIN (
        SELECT
          i.\`batch_id_column\` AS batch_id,
          SUBSTRING_INDEX(
            GROUP_CONCAT(f.\`type_column\` ORDER BY f.\`updated_at_column\` DESC SEPARATOR ','),
            ',', 1
          ) AS export_type
        FROM \`export_form_item_tbl\` i
        JOIN \`export_form_tbl\` f ON f.\`id_column\` = i.\`export_form_id_column\`
        WHERE f.\`status_column\` = 'CONFIRMED' AND i.\`batch_id_column\` IS NOT NULL
        GROUP BY i.\`batch_id_column\`
      ) last_export ON last_export.batch_id = b.\`id_column\`
      SET b.\`status_column\` = CASE last_export.export_type
        WHEN 'DISPOSAL' THEN 'DISPOSED'
        WHEN 'TRANSFER' THEN 'IN_TRANSIT'
        ELSE 'ISSUED'
      END
      WHERE b.\`remaining_quantity_column\` = 0;
    `);
  }

  /**
   * Code cũ chỉ giữ chỗ lúc gửi duyệt ⇒ cùng rào: phiếu nháp tạo sau `up` đang giữ chỗ mà code cũ
   * không bao giờ trả lại.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.assertNoDraftExportFormWithItems(queryRunner);

    await queryRunner.query(`
      UPDATE \`material_batch_tbl\`
      SET \`status_column\` = CASE
        WHEN \`status_column\` IN ('IN_STOCK', 'RESERVED') THEN '1'
        ELSE '0'
      END;
    `);
    await queryRunner.query(`
      ALTER TABLE \`material_batch_tbl\`
        MODIFY \`status_column\` TINYINT NOT NULL DEFAULT 1;
    `);
  }

  private async assertNoDraftExportFormWithItems(queryRunner: QueryRunner): Promise<void> {
    const rows: { code: string }[] = await queryRunner.query(`
      SELECT f.\`code_column\` AS code
      FROM \`export_form_tbl\` f
      WHERE f.\`status_column\` = 'DRAFT'
        AND f.\`deleted_at_column\` IS NULL
        AND EXISTS (
          SELECT 1 FROM \`export_form_item_tbl\` i WHERE i.\`export_form_id_column\` = f.\`id_column\`
        )
      LIMIT 20;
    `);
    if (rows.length)
      throw new Error(
        'Draft export forms hold no reservation under the old rule and would break once drafts ' +
          'reserve stock. Submit or delete them before migrating: ' +
          rows.map((row) => row.code).join(', '),
      );
  }
}
