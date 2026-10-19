import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dòng vật tư của phiếu nhập (`src/import-form/import-form-item.entity.ts`). Viết tay vì
 * `typeorm:g` không dùng được trên repo này (xem CLAUDE.md).
 *
 * - FK tới phiếu là CASCADE: dòng không tồn tại độc lập với phiếu (phiếu thực tế chỉ xoá mềm, khi
 *   đó dòng cũng xoá mềm theo `cascade` của TypeORM).
 * - FK tới vật tư/đơn vị là 2 FK đơn, RESTRICT — CỐ Ý KHÔNG dùng FK tổ hợp
 *   `(material_id, unit_id) -> material_unit_can_have_tbl` như CLAUDE.md gợi ý: FK đó sẽ khoá luôn
 *   việc gỡ đơn vị quy đổi khỏi vật tư một khi đã có phiếu dùng nó (lỗi SQL thô thành 500 ở
 *   `MaterialService`). Dòng phiếu đã snapshot `conversion_rate_column` nên không cần dòng join còn
 *   sống; "đơn vị phải thuộc vật tư" được kiểm ở service lúc ghi.
 * - UNIQUE (phiếu, vật tư, đơn vị): 1 cặp vật tư + đơn vị chỉ xuất hiện 1 lần trong 1 phiếu.
 * - `supplier_*`: snapshot nhà cung cấp của vật tư lúc ghi dòng, NULL-able (vật tư có thể chưa gắn
 *   nhà cung cấp), KHÔNG FK sang `supplier_tbl` — chỉ là bản chép, gỡ/xoá nhà cung cấp không bị chặn.
 * - Gỡ nhà cung cấp khỏi `import_form_tbl` (FK `supplier_id_column` + 5 cột snapshot `supplier_*`
 *   do `1783728000039` tạo): phiếu nhập không gắn nhà cung cấp. `down` thêm lại các cột dưới dạng
 *   NULL-able — phiếu ghi sau migration không có nhà cung cấp nên không khôi phục được NOT NULL.
 */
export class CreateImportFormItemTable1783728000040 implements MigrationInterface {
  name = 'CreateImportFormItemTable1783728000040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`import_form_item_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`import_form_id_column\` VARCHAR(36) NOT NULL,
        \`line_no_column\` INT NOT NULL,
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
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_import_form_item_slug\` (\`slug_column\`),
        UNIQUE INDEX \`UQ_import_form_item\` (\`import_form_id_column\`, \`material_id_column\`, \`unit_id_column\`),
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

    // Bỏ FK trước — MySQL không cho xoá index mà FK đang dùng.
    await queryRunner.query(
      `ALTER TABLE \`import_form_tbl\` DROP FOREIGN KEY \`FK_import_form_supplier\`;`,
    );
    await queryRunner.query(`
      ALTER TABLE \`import_form_tbl\`
        DROP INDEX \`IDX_import_form_supplier\`,
        DROP INDEX \`IDX_import_form_supplier_slug\`,
        DROP COLUMN \`supplier_id_column\`,
        DROP COLUMN \`supplier_name_column\`,
        DROP COLUMN \`supplier_code_column\`,
        DROP COLUMN \`supplier_slug_column\`,
        DROP COLUMN \`supplier_tax_code_column\`,
        DROP COLUMN \`supplier_address_column\`;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`import_form_tbl\`
        ADD COLUMN \`supplier_id_column\` VARCHAR(36) NULL AFTER \`invoice_code_column\`,
        ADD COLUMN \`supplier_name_column\` VARCHAR(255) NULL AFTER \`supplier_id_column\`,
        ADD COLUMN \`supplier_code_column\` VARCHAR(32) NULL AFTER \`supplier_name_column\`,
        ADD COLUMN \`supplier_slug_column\` VARCHAR(255) NULL AFTER \`supplier_code_column\`,
        ADD COLUMN \`supplier_tax_code_column\` VARCHAR(14) NULL AFTER \`supplier_slug_column\`,
        ADD COLUMN \`supplier_address_column\` VARCHAR(255) NULL AFTER \`supplier_tax_code_column\`,
        ADD INDEX \`IDX_import_form_supplier\` (\`supplier_id_column\`),
        ADD INDEX \`IDX_import_form_supplier_slug\` (\`supplier_slug_column\`),
        ADD CONSTRAINT \`FK_import_form_supplier\` FOREIGN KEY (\`supplier_id_column\`)
          REFERENCES \`supplier_tbl\` (\`id_column\`) ON DELETE RESTRICT;
    `);
    await queryRunner.query(`DROP TABLE \`import_form_item_tbl\`;`);
  }
}
