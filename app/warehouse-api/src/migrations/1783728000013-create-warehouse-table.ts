import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWarehouseTable1783728000013 implements MigrationInterface {
  name = 'CreateWarehouseTable1783728000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`warehouse_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`name_column\` VARCHAR(255) NOT NULL,
        \`code_column\` VARCHAR(32) NOT NULL,
        \`address_column\` VARCHAR(255) NOT NULL,
        \`phonenumber_column\` VARCHAR(20) NULL,
        \`description_column\` VARCHAR(255) NULL,
        \`is_active_column\` TINYINT NOT NULL DEFAULT 1,
        \`manager_id_column\` VARCHAR(36) NULL,
        \`version_column\` INT NOT NULL DEFAULT 1,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_warehouse_slug\` (\`slug_column\`),
        UNIQUE INDEX \`IDX_warehouse_code\` (\`code_column\`),
        INDEX \`IDX_warehouse_manager\` (\`manager_id_column\`),
        PRIMARY KEY (\`id_column\`)
      ) ENGINE=InnoDB;
    `);

    // ON DELETE SET NULL (khác \`FK_user_role\` dùng RESTRICT): "kho chưa có quản lý" là trạng thái
    // hợp lệ theo thiết kế, nên xoá user nên thoái hoá về trạng thái đó thay vì chặn cứng. RESTRICT
    // ở \`FK_user_role\` là vì cột đó NOT NULL — SET NULL không hợp lệ ở chỗ ấy.
    await queryRunner.query(`
      ALTER TABLE \`warehouse_tbl\`
        ADD CONSTRAINT \`FK_warehouse_manager\`
        FOREIGN KEY (\`manager_id_column\`) REFERENCES \`user_tbl\` (\`id_column\`)
        ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`warehouse_tbl\`;`);
  }
}
