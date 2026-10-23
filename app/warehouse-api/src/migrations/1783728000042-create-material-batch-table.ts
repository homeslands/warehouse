import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lô hàng (`src/material-batch/material-batch.entity.ts`). Viết tay vì `typeorm:g` không dùng được
 * trên repo này (xem CLAUDE.md). Lô chỉ đọc qua API (`MATERIAL_READ` + `WAREHOUSE_READ`, đã có) nên
 * không cần migration seed authority.
 *
 * - FK tới vật tư/kho/dòng phiếu nhập đều RESTRICT: lô là dấu vết tồn kho, không được biến mất theo
 *   bản ghi cha (thực tế cả 3 chỉ xoá mềm).
 * - `IDX_material_batch_fefo` phục vụ truy vấn FEFO lúc xác nhận phiếu xuất:
 *   `WHERE warehouse = ? AND material = ? AND status = 1 ... FOR UPDATE`.
 */
export class CreateMaterialBatchTable1783728000042 implements MigrationInterface {
  name = 'CreateMaterialBatchTable1783728000042';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`material_batch_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`material_id_column\` VARCHAR(36) NOT NULL,
        \`warehouse_id_column\` VARCHAR(36) NOT NULL,
        \`import_form_item_id_column\` VARCHAR(36) NOT NULL,
        \`entry_date_column\` DATE NOT NULL,
        \`expiry_date_column\` DATE NULL,
        \`quantity_column\` DECIMAL(18,6) NOT NULL,
        \`remaining_quantity_column\` DECIMAL(18,6) NOT NULL,
        \`status_column\` TINYINT NOT NULL DEFAULT 1,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_material_batch_slug\` (\`slug_column\`),
        INDEX \`IDX_material_batch_fefo\` (\`warehouse_id_column\`, \`material_id_column\`, \`status_column\`, \`expiry_date_column\`),
        INDEX \`IDX_material_batch_material\` (\`material_id_column\`),
        INDEX \`IDX_material_batch_import_form_item\` (\`import_form_item_id_column\`),
        PRIMARY KEY (\`id_column\`),
        CONSTRAINT \`FK_material_batch_material\` FOREIGN KEY (\`material_id_column\`)
          REFERENCES \`material_tbl\` (\`id_column\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_material_batch_warehouse\` FOREIGN KEY (\`warehouse_id_column\`)
          REFERENCES \`warehouse_tbl\` (\`id_column\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_material_batch_import_form_item\` FOREIGN KEY (\`import_form_item_id_column\`)
          REFERENCES \`import_form_item_tbl\` (\`id_column\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`material_batch_tbl\`;`);
  }
}
