import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phiếu xuất kho + dòng vật tư (`src/export-form/`). Viết tay vì `typeorm:g` không dùng được trên
 * repo này (xem CLAUDE.md). Authority `EXPORT_FORM_*` đã seed sẵn ở `1783728000012`.
 *
 * Phiếu (`export_form_tbl`) theo đúng khuôn `import_form_tbl`: `code` UNIQUE tính cả row xoá mềm,
 * FK kho RESTRICT, FK người lập/người duyệt SET NULL (tên còn ở cột snapshot).
 *
 * Dòng (`export_form_item_tbl`):
 * - FK tới phiếu CASCADE; vật tư/đơn vị/lô RESTRICT (2 FK đơn, cùng lý do như `import_form_item_tbl`).
 * - `batch_id_column` NULL-able: dòng nháp chưa chọn lô, xác nhận mới gán theo FEFO.
 * - KHÔNG có UNIQUE (phiếu, vật tư, đơn vị): xác nhận có thể tách 1 dòng thành nhiều dòng theo lô.
 */
export class CreateExportFormTables1783728000044 implements MigrationInterface {
  name = 'CreateExportFormTables1783728000044';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`export_form_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`code_column\` VARCHAR(32) NOT NULL,
        \`type_column\` VARCHAR(16) NOT NULL,
        \`status_column\` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
        \`purchase_order_column\` VARCHAR(64) NOT NULL,
        \`invoice_code_column\` VARCHAR(64) NULL,
        \`requester_id_column\` VARCHAR(36) NULL,
        \`requester_name_column\` VARCHAR(255) NOT NULL,
        \`approver_id_column\` VARCHAR(36) NULL,
        \`approver_name_column\` VARCHAR(255) NULL,
        \`receiver_column\` VARCHAR(255) NOT NULL,
        \`total_amount_column\` DECIMAL(18,2) NOT NULL DEFAULT 0,
        \`note_column\` TEXT NULL,
        \`file_column\` VARCHAR(1024) NULL,
        \`warehouse_id_column\` VARCHAR(36) NOT NULL,
        \`version_column\` INT NOT NULL DEFAULT 1,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_export_form_slug\` (\`slug_column\`),
        UNIQUE INDEX \`IDX_export_form_code\` (\`code_column\`),
        INDEX \`IDX_export_form_warehouse_status\` (\`warehouse_id_column\`, \`status_column\`),
        PRIMARY KEY (\`id_column\`),
        CONSTRAINT \`FK_export_form_warehouse\` FOREIGN KEY (\`warehouse_id_column\`)
          REFERENCES \`warehouse_tbl\` (\`id_column\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_export_form_requester\` FOREIGN KEY (\`requester_id_column\`)
          REFERENCES \`user_tbl\` (\`id_column\`) ON DELETE SET NULL,
        CONSTRAINT \`FK_export_form_approver\` FOREIGN KEY (\`approver_id_column\`)
          REFERENCES \`user_tbl\` (\`id_column\`) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE \`export_form_item_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`export_form_id_column\` VARCHAR(36) NOT NULL,
        \`line_no_column\` INT NOT NULL,
        \`material_id_column\` VARCHAR(36) NOT NULL,
        \`material_code_column\` VARCHAR(32) NOT NULL,
        \`material_name_column\` VARCHAR(255) NOT NULL,
        \`unit_id_column\` VARCHAR(36) NOT NULL,
        \`unit_code_column\` VARCHAR(32) NOT NULL,
        \`unit_name_column\` VARCHAR(255) NOT NULL,
        \`batch_id_column\` VARCHAR(36) NULL,
        \`quantity_column\` DECIMAL(18,6) NOT NULL,
        \`conversion_rate_column\` DECIMAL(18,6) NOT NULL,
        \`base_quantity_column\` DECIMAL(18,6) NOT NULL,
        \`unit_price_column\` DECIMAL(18,2) NOT NULL,
        \`amount_column\` DECIMAL(18,2) NOT NULL,
        \`note_column\` TEXT NULL,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_export_form_item_slug\` (\`slug_column\`),
        INDEX \`IDX_export_form_item_form\` (\`export_form_id_column\`),
        INDEX \`IDX_export_form_item_material\` (\`material_id_column\`),
        INDEX \`IDX_export_form_item_unit\` (\`unit_id_column\`),
        INDEX \`IDX_export_form_item_batch\` (\`batch_id_column\`),
        PRIMARY KEY (\`id_column\`),
        CONSTRAINT \`FK_export_form_item_form\` FOREIGN KEY (\`export_form_id_column\`)
          REFERENCES \`export_form_tbl\` (\`id_column\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_export_form_item_material\` FOREIGN KEY (\`material_id_column\`)
          REFERENCES \`material_tbl\` (\`id_column\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_export_form_item_unit\` FOREIGN KEY (\`unit_id_column\`)
          REFERENCES \`unit_tbl\` (\`id_column\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_export_form_item_batch\` FOREIGN KEY (\`batch_id_column\`)
          REFERENCES \`material_batch_tbl\` (\`id_column\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`export_form_item_tbl\`;`);
    await queryRunner.query(`DROP TABLE \`export_form_tbl\`;`);
  }
}
