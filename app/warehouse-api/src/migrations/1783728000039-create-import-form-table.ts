import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phiếu nhập kho (`src/import-form/import-form.entity.ts`) — mới phần đầu phiếu, chưa có dòng vật
 * tư. Viết tay vì `typeorm:g` không dùng được trên repo này (xem CLAUDE.md). Authority `IMPORT_FORM_*`
 * đã seed sẵn ở `1783728000012`, không cần migration seed riêng.
 *
 * - `code_column` UNIQUE tính cả row xoá mềm — service tra `withDeleted` để báo lỗi riêng.
 * - FK tới kho/nhà cung cấp là RESTRICT: phiếu là chứng từ, xoá cứng kho/nhà cung cấp không được
 *   cuốn theo phiếu (thực tế cả hai chỉ xoá mềm).
 * - FK tới người lập/người duyệt là SET NULL như `inventory_history_tbl`: xoá cứng user không được
 *   làm mất phiếu; tên vẫn còn ở cột snapshot `*_name_column`.
 */
export class CreateImportFormTable1783728000039 implements MigrationInterface {
  name = 'CreateImportFormTable1783728000039';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`import_form_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`code_column\` VARCHAR(32) NOT NULL,
        \`purchase_order_column\` VARCHAR(64) NULL,
        \`invoice_code_column\` VARCHAR(64) NOT NULL,
        \`supplier_id_column\` VARCHAR(36) NOT NULL,
        \`supplier_name_column\` VARCHAR(255) NOT NULL,
        \`supplier_code_column\` VARCHAR(32) NOT NULL,
        \`supplier_slug_column\` VARCHAR(255) NOT NULL,
        \`supplier_tax_code_column\` VARCHAR(14) NULL,
        \`supplier_address_column\` VARCHAR(255) NULL,
        \`requester_id_column\` VARCHAR(36) NULL,
        \`requester_name_column\` VARCHAR(255) NOT NULL,
        \`approver_id_column\` VARCHAR(36) NULL,
        \`approver_name_column\` VARCHAR(255) NULL,
        \`date_column\` DATE NOT NULL,
        \`total_column\` DECIMAL(18,2) NOT NULL DEFAULT 0,
        \`file_column\` VARCHAR(1024) NULL,
        \`note_column\` TEXT NULL,
        \`status_column\` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
        \`warehouse_id_column\` VARCHAR(36) NOT NULL,
        \`version_column\` INT NOT NULL DEFAULT 1,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_import_form_slug\` (\`slug_column\`),
        UNIQUE INDEX \`IDX_import_form_code\` (\`code_column\`),
        INDEX \`IDX_import_form_warehouse_status\` (\`warehouse_id_column\`, \`status_column\`),
        INDEX \`IDX_import_form_supplier\` (\`supplier_id_column\`),
        INDEX \`IDX_import_form_supplier_slug\` (\`supplier_slug_column\`),
        PRIMARY KEY (\`id_column\`),
        CONSTRAINT \`FK_import_form_warehouse\` FOREIGN KEY (\`warehouse_id_column\`)
          REFERENCES \`warehouse_tbl\` (\`id_column\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_import_form_supplier\` FOREIGN KEY (\`supplier_id_column\`)
          REFERENCES \`supplier_tbl\` (\`id_column\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_import_form_requester\` FOREIGN KEY (\`requester_id_column\`)
          REFERENCES \`user_tbl\` (\`id_column\`) ON DELETE SET NULL,
        CONSTRAINT \`FK_import_form_approver\` FOREIGN KEY (\`approver_id_column\`)
          REFERENCES \`user_tbl\` (\`id_column\`) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`import_form_tbl\`;`);
  }
}
