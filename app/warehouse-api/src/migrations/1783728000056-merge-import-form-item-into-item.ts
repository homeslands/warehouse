import { MigrationInterface, QueryRunner } from 'typeorm';

/** Cột snapshot chép giữa dòng phiếu nhập cũ và item — cùng tên ở 2 bảng. */
const SNAPSHOT_COLUMNS = [
  'line_no_column',
  'material_code_column',
  'material_name_column',
  'unit_id_column',
  'unit_code_column',
  'unit_name_column',
  'supplier_slug_column',
  'supplier_code_column',
  'supplier_name_column',
  'supplier_tax_code_column',
  'supplier_address_column',
  'quantity_column',
  'conversion_rate_column',
  'unit_price_column',
  'amount_column',
  'note_column',
];

const NOT_NULL_COLUMNS = `
  MODIFY \`import_form_id_column\` VARCHAR(36) NOT NULL,
  MODIFY \`line_no_column\` INT NOT NULL,
  MODIFY \`material_code_column\` VARCHAR(32) NOT NULL,
  MODIFY \`material_name_column\` VARCHAR(255) NOT NULL,
  MODIFY \`unit_id_column\` VARCHAR(36) NOT NULL,
  MODIFY \`unit_code_column\` VARCHAR(32) NOT NULL,
  MODIFY \`unit_name_column\` VARCHAR(255) NOT NULL,
  MODIFY \`quantity_column\` DECIMAL(18,6) NOT NULL,
  MODIFY \`conversion_rate_column\` DECIMAL(18,6) NOT NULL,
  MODIFY \`unit_price_column\` DECIMAL(18,2) NOT NULL,
  MODIFY \`amount_column\` DECIMAL(18,2) NOT NULL
`;

const q = (column: string) => `\`${column}\``;

/**
 * Gộp dòng phiếu nhập vào lô, đổi lô thành **item** (`src/item/item.entity.ts`): 1 item = 1 đơn vị
 * hàng = 1 dòng phiếu nhập, sinh ngay lúc thêm vào phiếu nháp (`PENDING`), FK thẳng tới phiếu nhập.
 * Viết tay vì `typeorm:g` không dùng được trên repo này (xem CLAUDE.md).
 *
 * - `material_batch_tbl` ⇒ `item_tbl`; index/FK đổi tên theo (FK không có `RENAME CONSTRAINT` nên
 *   DROP + ADD, giữ `ON DELETE RESTRICT`). `quantity_column` (lượng nhập, đơn vị cơ sở) ⇒
 *   `base_quantity_column`; `quantity_column` mới = số lượng theo đơn vị của dòng.
 * - Thêm `import_form_id_column` (FK RESTRICT — phiếu nhập chỉ xoá mềm) + các cột snapshot của dòng
 *   (`unit_id_column` FK RESTRICT, không FK tổ hợp — cùng lý do `1783728000040`). Bỏ
 *   `import_form_item_id_column`.
 * - Backfill: lô có sẵn (dòng của phiếu `CONFIRMED`) nhận snapshot của dòng sinh ra nó. Dòng chưa có
 *   lô thành item mới, giữ nguyên `id`/`slug`/`code` của dòng: phiếu `DRAFT` ⇒ `PENDING`,
 *   `CANCELLED` ⇒ `VOID`. Dòng đã xoá mềm (phiếu nháp đã xoá) bị bỏ — luồng mới xoá cứng item của
 *   nháp bị xoá; mã đã cấp không cấp lại nên không mất gì. Dòng của phiếu `CONFIRMED` chưa có lô
 *   (lẽ ra `1783728000045` đã sinh) ⇒ TỪ CHỐI chạy, không đoán được lô đó đã xuất bao nhiêu.
 * - `status_column` mặc định `PENDING`.
 * - `export_form_item_tbl.batch_id_column` ⇒ `item_id_column`.
 * - Xoá `import_form_item_tbl`.
 *
 * `down` dựng lại `import_form_item_tbl` từ mọi item (giữ `id`), nối lô ⇒ dòng bằng chính `id` đó,
 * rồi xoá item `PENDING`/`VOID` (luồng cũ chỉ có lô sau khi xác nhận phiếu).
 */
export class MergeImportFormItemIntoItem1783728000056 implements MigrationInterface {
  name = 'MergeImportFormItemIntoItem1783728000056';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertConfirmedLinesHaveBatch(queryRunner);

    await queryRunner.query(`RENAME TABLE \`material_batch_tbl\` TO \`item_tbl\`;`);
    await queryRunner.query(`
      ALTER TABLE \`item_tbl\`
        DROP FOREIGN KEY \`FK_material_batch_material\`,
        DROP FOREIGN KEY \`FK_material_batch_warehouse\`,
        DROP FOREIGN KEY \`FK_material_batch_import_form_item\`;
    `);
    // Đổi tên trước, thêm `quantity_column` mới ở câu sau — MySQL không cho cùng 1 câu.
    await queryRunner.query(
      `ALTER TABLE \`item_tbl\` RENAME COLUMN \`quantity_column\` TO \`base_quantity_column\`;`,
    );
    await queryRunner.query(`
      ALTER TABLE \`item_tbl\`
        RENAME INDEX \`IDX_material_batch_slug\` TO \`IDX_item_slug\`,
        RENAME INDEX \`IDX_material_batch_fefo\` TO \`IDX_item_fefo\`,
        RENAME INDEX \`IDX_material_batch_material\` TO \`IDX_item_material\`,
        RENAME INDEX \`UQ_material_batch_code\` TO \`UQ_item_code\`,
        MODIFY \`status_column\` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        ADD COLUMN \`import_form_id_column\` VARCHAR(36) NULL AFTER \`slug_column\`,
        ADD COLUMN \`line_no_column\` INT NULL AFTER \`import_form_id_column\`,
        ADD COLUMN \`material_code_column\` VARCHAR(32) NULL AFTER \`material_id_column\`,
        ADD COLUMN \`material_name_column\` VARCHAR(255) NULL AFTER \`material_code_column\`,
        ADD COLUMN \`unit_id_column\` VARCHAR(36) NULL AFTER \`material_name_column\`,
        ADD COLUMN \`unit_code_column\` VARCHAR(32) NULL AFTER \`unit_id_column\`,
        ADD COLUMN \`unit_name_column\` VARCHAR(255) NULL AFTER \`unit_code_column\`,
        ADD COLUMN \`supplier_slug_column\` VARCHAR(255) NULL AFTER \`unit_name_column\`,
        ADD COLUMN \`supplier_code_column\` VARCHAR(32) NULL AFTER \`supplier_slug_column\`,
        ADD COLUMN \`supplier_name_column\` VARCHAR(255) NULL AFTER \`supplier_code_column\`,
        ADD COLUMN \`supplier_tax_code_column\` VARCHAR(14) NULL AFTER \`supplier_name_column\`,
        ADD COLUMN \`supplier_address_column\` VARCHAR(255) NULL AFTER \`supplier_tax_code_column\`,
        ADD COLUMN \`quantity_column\` DECIMAL(18,6) NULL AFTER \`expiry_date_column\`,
        ADD COLUMN \`conversion_rate_column\` DECIMAL(18,6) NULL AFTER \`quantity_column\`,
        ADD COLUMN \`unit_price_column\` DECIMAL(18,2) NULL AFTER \`reserved_quantity_column\`,
        ADD COLUMN \`amount_column\` DECIMAL(18,2) NULL AFTER \`unit_price_column\`,
        ADD COLUMN \`note_column\` TEXT NULL AFTER \`amount_column\`;
    `);

    // Lô có sẵn ⇒ snapshot của dòng sinh ra nó (1 dòng ⇒ đúng 1 lô).
    await queryRunner.query(`
      UPDATE \`item_tbl\` b
      JOIN \`import_form_item_tbl\` i ON i.\`id_column\` = b.\`import_form_item_id_column\`
      SET b.\`import_form_id_column\` = i.\`import_form_id_column\`,
        ${SNAPSHOT_COLUMNS.map((c) => `b.${q(c)} = i.${q(c)}`).join(',\n        ')};
    `);

    // Dòng chưa có lô ⇒ item mới, giữ `id`/`slug`/`code` của dòng.
    await queryRunner.query(`
      INSERT INTO \`item_tbl\` (
        \`id_column\`, \`slug_column\`, \`import_form_id_column\`, \`code_column\`,
        \`material_id_column\`, \`warehouse_id_column\`, \`entry_date_column\`, \`expiry_date_column\`,
        \`base_quantity_column\`, \`remaining_quantity_column\`, \`reserved_quantity_column\`,
        \`status_column\`, \`created_at_column\`, \`updated_at_column\`, \`created_by_column\`,
        ${SNAPSHOT_COLUMNS.map(q).join(', ')}
      )
      SELECT
        i.\`id_column\`, i.\`slug_column\`, i.\`import_form_id_column\`, i.\`code_column\`,
        i.\`material_id_column\`, f.\`warehouse_id_column\`, f.\`date_column\`, i.\`expiry_date_column\`,
        i.\`base_quantity_column\`, i.\`base_quantity_column\`, 0,
        CASE f.\`status_column\` WHEN 'DRAFT' THEN 'PENDING' ELSE 'VOID' END,
        i.\`created_at_column\`, i.\`updated_at_column\`, i.\`created_by_column\`,
        ${SNAPSHOT_COLUMNS.map((c) => `i.${q(c)}`).join(', ')}
      FROM \`import_form_item_tbl\` i
      JOIN \`import_form_tbl\` f ON f.\`id_column\` = i.\`import_form_id_column\`
      WHERE i.\`deleted_at_column\` IS NULL
        AND f.\`deleted_at_column\` IS NULL
        AND f.\`status_column\` IN ('DRAFT', 'CANCELLED')
        AND NOT EXISTS (
          SELECT 1 FROM \`item_tbl\` b WHERE b.\`import_form_item_id_column\` = i.\`id_column\`
        );
    `);

    await queryRunner.query(`
      ALTER TABLE \`item_tbl\`
        DROP INDEX \`IDX_material_batch_import_form_item\`,
        DROP COLUMN \`import_form_item_id_column\`,
        ${NOT_NULL_COLUMNS},
        ADD INDEX \`IDX_item_form_line\` (\`import_form_id_column\`, \`line_no_column\`),
        ADD INDEX \`IDX_item_unit\` (\`unit_id_column\`);
    `);
    await queryRunner.query(`
      ALTER TABLE \`item_tbl\`
        ADD CONSTRAINT \`FK_item_material\` FOREIGN KEY (\`material_id_column\`)
          REFERENCES \`material_tbl\` (\`id_column\`) ON DELETE RESTRICT,
        ADD CONSTRAINT \`FK_item_warehouse\` FOREIGN KEY (\`warehouse_id_column\`)
          REFERENCES \`warehouse_tbl\` (\`id_column\`) ON DELETE RESTRICT,
        ADD CONSTRAINT \`FK_item_import_form\` FOREIGN KEY (\`import_form_id_column\`)
          REFERENCES \`import_form_tbl\` (\`id_column\`) ON DELETE RESTRICT,
        ADD CONSTRAINT \`FK_item_unit\` FOREIGN KEY (\`unit_id_column\`)
          REFERENCES \`unit_tbl\` (\`id_column\`) ON DELETE RESTRICT;
    `);

    await queryRunner.query(`
      ALTER TABLE \`export_form_item_tbl\` DROP FOREIGN KEY \`FK_export_form_item_batch\`;
    `);
    await queryRunner.query(`
      ALTER TABLE \`export_form_item_tbl\`
        RENAME COLUMN \`batch_id_column\` TO \`item_id_column\`,
        RENAME INDEX \`IDX_export_form_item_batch\` TO \`IDX_export_form_item_item\`,
        ADD CONSTRAINT \`FK_export_form_item_item\` FOREIGN KEY (\`item_id_column\`)
          REFERENCES \`item_tbl\` (\`id_column\`) ON DELETE RESTRICT;
    `);

    await queryRunner.query(`DROP TABLE \`import_form_item_tbl\`;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`import_form_item_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`import_form_id_column\` VARCHAR(36) NOT NULL,
        \`line_no_column\` INT NOT NULL,
        \`code_column\` VARCHAR(64) NULL,
        \`material_id_column\` VARCHAR(36) NOT NULL,
        \`material_code_column\` VARCHAR(32) NOT NULL,
        \`material_name_column\` VARCHAR(255) NOT NULL,
        \`unit_id_column\` VARCHAR(36) NOT NULL,
        \`unit_code_column\` VARCHAR(32) NOT NULL,
        \`unit_name_column\` VARCHAR(255) NOT NULL,
        \`supplier_slug_column\` VARCHAR(255) NULL,
        \`supplier_code_column\` VARCHAR(32) NULL,
        \`supplier_name_column\` VARCHAR(255) NULL,
        \`supplier_tax_code_column\` VARCHAR(14) NULL,
        \`supplier_address_column\` VARCHAR(255) NULL,
        \`quantity_column\` DECIMAL(18,6) NOT NULL,
        \`conversion_rate_column\` DECIMAL(18,6) NOT NULL,
        \`base_quantity_column\` DECIMAL(18,6) NOT NULL,
        \`unit_price_column\` DECIMAL(18,2) NOT NULL,
        \`amount_column\` DECIMAL(18,2) NOT NULL,
        \`note_column\` TEXT NULL,
        \`expiry_date_column\` DATE NULL,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_import_form_item_slug\` (\`slug_column\`),
        UNIQUE INDEX \`UQ_import_form_item_code\` (\`code_column\`),
        INDEX \`IDX_import_form_item_form_line\` (\`import_form_id_column\`, \`line_no_column\`),
        INDEX \`IDX_import_form_item_material\` (\`material_id_column\`),
        INDEX \`IDX_import_form_item_unit\` (\`unit_id_column\`),
        PRIMARY KEY (\`id_column\`),
        CONSTRAINT \`FK_import_form_item_form\` FOREIGN KEY (\`import_form_id_column\`)
          REFERENCES \`import_form_tbl\` (\`id_column\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_import_form_item_material\` FOREIGN KEY (\`material_id_column\`)
          REFERENCES \`material_tbl\` (\`id_column\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_import_form_item_unit\` FOREIGN KEY (\`unit_id_column\`)
          REFERENCES \`unit_tbl\` (\`id_column\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);
    await queryRunner.query(`
      INSERT INTO \`import_form_item_tbl\` (
        \`id_column\`, \`slug_column\`, \`import_form_id_column\`, \`code_column\`,
        \`material_id_column\`, \`base_quantity_column\`, \`expiry_date_column\`,
        \`created_at_column\`, \`updated_at_column\`, \`deleted_at_column\`, \`created_by_column\`,
        ${SNAPSHOT_COLUMNS.map(q).join(', ')}
      )
      SELECT
        \`id_column\`, \`slug_column\`, \`import_form_id_column\`, \`code_column\`,
        \`material_id_column\`, \`base_quantity_column\`, \`expiry_date_column\`,
        \`created_at_column\`, \`updated_at_column\`, \`deleted_at_column\`, \`created_by_column\`,
        ${SNAPSHOT_COLUMNS.map(q).join(', ')}
      FROM \`item_tbl\`;
    `);

    await queryRunner.query(`
      ALTER TABLE \`export_form_item_tbl\` DROP FOREIGN KEY \`FK_export_form_item_item\`;
    `);
    await queryRunner.query(`
      ALTER TABLE \`export_form_item_tbl\`
        RENAME COLUMN \`item_id_column\` TO \`batch_id_column\`,
        RENAME INDEX \`IDX_export_form_item_item\` TO \`IDX_export_form_item_batch\`;
    `);

    await queryRunner.query(`
      ALTER TABLE \`item_tbl\`
        DROP FOREIGN KEY \`FK_item_material\`,
        DROP FOREIGN KEY \`FK_item_warehouse\`,
        DROP FOREIGN KEY \`FK_item_import_form\`,
        DROP FOREIGN KEY \`FK_item_unit\`;
    `);
    // Luồng cũ chỉ có lô sau khi xác nhận phiếu: item nháp/huỷ chỉ còn là dòng phiếu.
    await queryRunner.query(
      `DELETE FROM \`item_tbl\` WHERE \`status_column\` IN ('PENDING', 'VOID');`,
    );
    await queryRunner.query(`
      ALTER TABLE \`item_tbl\`
        ADD COLUMN \`import_form_item_id_column\` VARCHAR(36) NULL AFTER \`warehouse_id_column\`;
    `);
    await queryRunner.query(
      `UPDATE \`item_tbl\` SET \`import_form_item_id_column\` = \`id_column\`;`,
    );
    await queryRunner.query(`
      ALTER TABLE \`item_tbl\`
        DROP INDEX \`IDX_item_form_line\`,
        DROP INDEX \`IDX_item_unit\`,
        ${['import_form_id_column', ...SNAPSHOT_COLUMNS].map((c) => `DROP COLUMN ${q(c)}`).join(',\n        ')};
    `);
    await queryRunner.query(`
      ALTER TABLE \`item_tbl\`
        RENAME COLUMN \`base_quantity_column\` TO \`quantity_column\`,
        MODIFY \`import_form_item_id_column\` VARCHAR(36) NOT NULL,
        MODIFY \`status_column\` VARCHAR(16) NOT NULL DEFAULT 'IN_STOCK',
        ADD INDEX \`IDX_material_batch_import_form_item\` (\`import_form_item_id_column\`),
        RENAME INDEX \`IDX_item_slug\` TO \`IDX_material_batch_slug\`,
        RENAME INDEX \`IDX_item_fefo\` TO \`IDX_material_batch_fefo\`,
        RENAME INDEX \`IDX_item_material\` TO \`IDX_material_batch_material\`,
        RENAME INDEX \`UQ_item_code\` TO \`UQ_material_batch_code\`;
    `);
    await queryRunner.query(`
      ALTER TABLE \`item_tbl\`
        ADD CONSTRAINT \`FK_material_batch_material\` FOREIGN KEY (\`material_id_column\`)
          REFERENCES \`material_tbl\` (\`id_column\`) ON DELETE RESTRICT,
        ADD CONSTRAINT \`FK_material_batch_warehouse\` FOREIGN KEY (\`warehouse_id_column\`)
          REFERENCES \`warehouse_tbl\` (\`id_column\`) ON DELETE RESTRICT,
        ADD CONSTRAINT \`FK_material_batch_import_form_item\` FOREIGN KEY (\`import_form_item_id_column\`)
          REFERENCES \`import_form_item_tbl\` (\`id_column\`) ON DELETE RESTRICT;
    `);
    await queryRunner.query(`RENAME TABLE \`item_tbl\` TO \`material_batch_tbl\`;`);

    await queryRunner.query(`
      ALTER TABLE \`export_form_item_tbl\`
        ADD CONSTRAINT \`FK_export_form_item_batch\` FOREIGN KEY (\`batch_id_column\`)
          REFERENCES \`material_batch_tbl\` (\`id_column\`) ON DELETE RESTRICT;
    `);
  }

  private async assertConfirmedLinesHaveBatch(queryRunner: QueryRunner): Promise<void> {
    const rows: { code: string }[] = await queryRunner.query(`
      SELECT DISTINCT f.\`code_column\` AS code
      FROM \`import_form_item_tbl\` i
      JOIN \`import_form_tbl\` f ON f.\`id_column\` = i.\`import_form_id_column\`
      WHERE f.\`status_column\` = 'CONFIRMED'
        AND i.\`deleted_at_column\` IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM \`material_batch_tbl\` b
          WHERE b.\`import_form_item_id_column\` = i.\`id_column\`
        )
      LIMIT 20;
    `);
    if (rows.length)
      throw new Error(
        'Confirmed import form lines without a material batch cannot become items (their stock ' +
          'movements are unknown). Create the missing batches first: ' +
          rows.map((row) => row.code).join(', '),
      );
  }
}
