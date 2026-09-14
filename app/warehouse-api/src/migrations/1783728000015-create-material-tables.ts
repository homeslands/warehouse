import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Viết TAY, không dùng `typeorm:g`. `migration:generate` trên DB này diff cả schema cũ và đẻ ra
 * hàng chục lệnh ngoài phạm vi (drop/re-add `user_tbl.phonenumber_column` và
 * `warehouse_tbl.code_column` — MẤT DỮ LIỆU, hạ `FK_user_role` từ RESTRICT xuống NO ACTION,
 * `FK_warehouse_manager` từ SET NULL xuống NO ACTION, đổi tên toàn bộ index thủ công thành hash),
 * vì các migration cũ đặt tên index/FK thủ công và dùng VARCHAR hẹp hơn suy diễn từ entity.
 * Nếu cần sinh lại: sinh ra rồi XOÁ mọi lệnh không thuộc 3 bảng dưới đây.
 */
export class CreateMaterialTables1783728000015 implements MigrationInterface {
  name = 'CreateMaterialTables1783728000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`material_type_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`name_column\` VARCHAR(255) NOT NULL,
        \`code_column\` VARCHAR(32) NOT NULL,
        \`description_column\` VARCHAR(255) NULL,
        \`version_column\` INT NOT NULL DEFAULT 1,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_material_type_slug\` (\`slug_column\`),
        UNIQUE INDEX \`IDX_material_type_name\` (\`name_column\`),
        UNIQUE INDEX \`IDX_material_type_code\` (\`code_column\`),
        PRIMARY KEY (\`id_column\`)
      ) ENGINE=InnoDB;
    `);

    // \`name_column\` KHÔNG unique (khác \`material_type_tbl\`): 2 loại vật tư khác nhau được phép
    // trùng tên, \`code_column\` mới là khoá nghiệp vụ.
    await queryRunner.query(`
      CREATE TABLE \`material_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`code_column\` VARCHAR(32) NOT NULL,
        \`name_column\` VARCHAR(255) NOT NULL,
        \`type_id_column\` VARCHAR(36) NOT NULL,
        \`minimum_inventory_column\` INT NOT NULL DEFAULT 0,
        \`maximum_inventory_column\` INT NOT NULL DEFAULT 0,
        \`version_column\` INT NOT NULL DEFAULT 1,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_material_slug\` (\`slug_column\`),
        UNIQUE INDEX \`IDX_material_code\` (\`code_column\`),
        INDEX \`IDX_material_type\` (\`type_id_column\`),
        PRIMARY KEY (\`id_column\`)
      ) ENGINE=InnoDB;
    `);

    // ON DELETE RESTRICT: cột NOT NULL nên SET NULL không hợp lệ, và service đã chặn xoá loại vật
    // tư còn material tham chiếu — FK này là lưới an toàn cho đường xoá thẳng dưới DB.
    await queryRunner.query(`
      ALTER TABLE \`material_tbl\`
        ADD CONSTRAINT \`FK_material_type\`
        FOREIGN KEY (\`type_id_column\`) REFERENCES \`material_type_tbl\` (\`id_column\`)
        ON DELETE RESTRICT;
    `);

    // \`quantity_column\` NOT NULL DEFAULT 0 và luôn >= 0 (rào ở service bằng 1 UPDATE có điều
    // kiện). 2 cột ngưỡng NULLABLE vì NULL mang nghĩa "theo ngưỡng mặc định của material".
    await queryRunner.query(`
      CREATE TABLE \`warehouse_material_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`warehouse_id_column\` VARCHAR(36) NOT NULL,
        \`material_id_column\` VARCHAR(36) NOT NULL,
        \`quantity_column\` INT NOT NULL DEFAULT 0,
        \`minimum_inventory_column\` INT NULL,
        \`maximum_inventory_column\` INT NULL,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_warehouse_material_slug\` (\`slug_column\`),
        UNIQUE INDEX \`UQ_warehouse_material\` (\`warehouse_id_column\`, \`material_id_column\`),
        INDEX \`IDX_warehouse_material_material\` (\`material_id_column\`),
        PRIMARY KEY (\`id_column\`)
      ) ENGINE=InnoDB;
    `);

    // CASCADE theo kho: xoá cứng 1 kho thì dòng tồn của kho đó không còn nghĩa gì. RESTRICT theo
    // vật tư: xoá vật tư còn nằm trong kho nào đó là mất dấu tồn, service cũng đã chặn sẵn.
    await queryRunner.query(`
      ALTER TABLE \`warehouse_material_tbl\`
        ADD CONSTRAINT \`FK_warehouse_material_warehouse\`
        FOREIGN KEY (\`warehouse_id_column\`) REFERENCES \`warehouse_tbl\` (\`id_column\`)
        ON DELETE CASCADE;
    `);
    await queryRunner.query(`
      ALTER TABLE \`warehouse_material_tbl\`
        ADD CONSTRAINT \`FK_warehouse_material_material\`
        FOREIGN KEY (\`material_id_column\`) REFERENCES \`material_tbl\` (\`id_column\`)
        ON DELETE RESTRICT;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`warehouse_material_tbl\`;`);
    await queryRunner.query(`DROP TABLE \`material_tbl\`;`);
    await queryRunner.query(`DROP TABLE \`material_type_tbl\`;`);
  }
}
