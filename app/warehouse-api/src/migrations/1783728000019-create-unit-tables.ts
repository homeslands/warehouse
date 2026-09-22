import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Viết TAY, không dùng `typeorm:g` (xem lý do ở `1783728000015-create-material-tables.ts` và mục
 * "Nợ kỹ thuật" trong `CLAUDE.md`): `migration:generate` trên DB này diff cả schema cũ và đẻ ra
 * hàng chục lệnh ngoài phạm vi làm mất dữ liệu.
 *
 * Phạm vi: `unit_tbl` + bảng join N-N `material_unit_can_have_tbl` (owning side là
 * `Material.unitsCanHave`).
 */
export class CreateUnitTables1783728000019 implements MigrationInterface {
  name = 'CreateUnitTables1783728000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`unit_tbl\` (
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
        UNIQUE INDEX \`IDX_unit_slug\` (\`slug_column\`),
        UNIQUE INDEX \`IDX_unit_name\` (\`name_column\`),
        UNIQUE INDEX \`IDX_unit_code\` (\`code_column\`),
        PRIMARY KEY (\`id_column\`)
      ) ENGINE=InnoDB;
    `);

    // Bảng join thuần (không kế thừa `Base`): PK là cặp khoá, không có `id_column`/soft-delete —
    // 1 cặp (material, unit) chỉ tồn tại hoặc không. Index phụ theo `unit_id_column` để truy ngược
    // Unit -> Material (dùng bởi rào `UNIT_IN_USE` lúc xoá unit).
    await queryRunner.query(`
      CREATE TABLE \`material_unit_can_have_tbl\` (
        \`material_id_column\` VARCHAR(36) NOT NULL,
        \`unit_id_column\` VARCHAR(36) NOT NULL,
        INDEX \`IDX_material_unit_can_have_unit\` (\`unit_id_column\`),
        PRIMARY KEY (\`material_id_column\`, \`unit_id_column\`)
      ) ENGINE=InnoDB;
    `);

    // CASCADE cả 2 chiều: 1 dòng join không còn nghĩa gì khi mất 1 trong 2 đầu. Đây chỉ là lưới an
    // toàn cho đường xoá CỨNG dưới DB — đường xoá mềm qua API đã bị `UnitService.deleteUnit` chặn
    // bằng `UNIT_IN_USE` (FK không nhìn thấy `deleted_at_column`).
    await queryRunner.query(`
      ALTER TABLE \`material_unit_can_have_tbl\`
        ADD CONSTRAINT \`FK_material_unit_can_have_material\`
        FOREIGN KEY (\`material_id_column\`) REFERENCES \`material_tbl\` (\`id_column\`)
        ON DELETE CASCADE ON UPDATE CASCADE;
    `);
    await queryRunner.query(`
      ALTER TABLE \`material_unit_can_have_tbl\`
        ADD CONSTRAINT \`FK_material_unit_can_have_unit\`
        FOREIGN KEY (\`unit_id_column\`) REFERENCES \`unit_tbl\` (\`id_column\`)
        ON DELETE CASCADE ON UPDATE CASCADE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`material_unit_can_have_tbl\`;`);
    await queryRunner.query(`DROP TABLE \`unit_tbl\`;`);
  }
}
