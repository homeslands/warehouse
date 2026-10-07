import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nhà cung cấp (`src/supplier/`): `supplier_tbl`, sổ giao dịch `supplier_transaction_tbl`, và cột
 * `material_tbl.supplier_id_column` (1 nhà cung cấp - n vật tư). Viết tay vì `typeorm:g` không dùng
 * được trên repo này (xem CLAUDE.md).
 *
 * - `material_tbl.supplier_id_column` NULL-able + `ON DELETE SET NULL`: vật tư tồn tại độc lập với
 *   nhà cung cấp; service chặn xoá (mềm) nhà cung cấp còn vật tư gắn.
 * - `supplier_transaction_tbl`: FK tới nhà cung cấp là RESTRICT (sổ giao dịch là chứng từ, xoá cứng
 *   nhà cung cấp không được cuốn theo lịch sử — thực tế chỉ xoá mềm). FK tới vật tư RESTRICT vì cùng
 *   lý do; FK tới người thao tác SET NULL như `store_warehouse_history_tbl`.
 */
export class CreateSupplierTables1783728000031 implements MigrationInterface {
  name = 'CreateSupplierTables1783728000031';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`supplier_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`code_column\` VARCHAR(32) NOT NULL,
        \`name_column\` VARCHAR(255) NOT NULL,
        \`tax_code_column\` VARCHAR(14) NULL,
        \`phonenumber_column\` VARCHAR(16) NULL,
        \`email_column\` VARCHAR(255) NULL,
        \`address_column\` VARCHAR(255) NULL,
        \`contact_person_column\` VARCHAR(255) NULL,
        \`note_column\` TEXT NULL,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_supplier_slug\` (\`slug_column\`),
        UNIQUE INDEX \`IDX_supplier_code\` (\`code_column\`),
        INDEX \`IDX_supplier_tax_code\` (\`tax_code_column\`),
        PRIMARY KEY (\`id_column\`)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      ALTER TABLE \`material_tbl\`
        ADD \`supplier_id_column\` VARCHAR(36) NULL,
        ADD INDEX \`IDX_material_supplier\` (\`supplier_id_column\`),
        ADD CONSTRAINT \`FK_material_supplier\`
          FOREIGN KEY (\`supplier_id_column\`) REFERENCES \`supplier_tbl\` (\`id_column\`)
          ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE \`supplier_transaction_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`supplier_id_column\` VARCHAR(36) NOT NULL,
        \`type_column\` VARCHAR(16) NOT NULL,
        \`material_id_column\` VARCHAR(36) NULL,
        \`quantity_column\` DECIMAL(18,6) NULL,
        \`unit_price_column\` DECIMAL(18,2) NULL,
        \`amount_column\` DECIMAL(18,2) NOT NULL,
        \`transaction_date_column\` DATETIME(6) NOT NULL,
        \`note_column\` TEXT NULL,
        \`performed_by_id_column\` VARCHAR(36) NULL,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_supplier_transaction_slug\` (\`slug_column\`),
        INDEX \`IDX_supplier_transaction_supplier_date\` (\`supplier_id_column\`, \`transaction_date_column\`),
        INDEX \`IDX_supplier_transaction_material\` (\`material_id_column\`),
        PRIMARY KEY (\`id_column\`),
        CONSTRAINT \`FK_st_supplier\` FOREIGN KEY (\`supplier_id_column\`)
          REFERENCES \`supplier_tbl\` (\`id_column\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_st_material\` FOREIGN KEY (\`material_id_column\`)
          REFERENCES \`material_tbl\` (\`id_column\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_st_performed_by\` FOREIGN KEY (\`performed_by_id_column\`)
          REFERENCES \`user_tbl\` (\`id_column\`) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`supplier_transaction_tbl\`;`);
    await queryRunner.query(
      `ALTER TABLE \`material_tbl\` DROP FOREIGN KEY \`FK_material_supplier\`;`,
    );
    await queryRunner.query(`ALTER TABLE \`material_tbl\` DROP INDEX \`IDX_material_supplier\`;`);
    await queryRunner.query(`ALTER TABLE \`material_tbl\` DROP COLUMN \`supplier_id_column\`;`);
    await queryRunner.query(`DROP TABLE \`supplier_tbl\`;`);
  }
}
