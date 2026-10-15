import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vật tư - nhà cung cấp đổi từ 1 - n (FK `material_tbl.supplier_id_column`, migration
 * `1783728000031`) sang n - n qua bảng join `material_supplier_tbl`. Viết tay vì `typeorm:g` không
 * dùng được trên repo này (xem CLAUDE.md).
 *
 * - PK tổ hợp `(material_id, supplier_id)`: 1 cặp chỉ gắn 1 lần. Index riêng cho `supplier_id` để
 *   tra "vật tư của nhà cung cấp" (vế trái của PK đã phục vụ chiều ngược lại).
 * - 2 FK đều CASCADE: dòng join không có nghĩa khi 1 trong 2 bên bị xoá cứng (thực tế cả 2 chỉ xoá
 *   mềm; service chặn xoá nhà cung cấp còn vật tư gắn).
 * - Chép dữ liệu cũ sang bảng join TRƯỚC khi bỏ cột — không mất liên kết đang có.
 * - `down`: thêm lại cột + FK, chép ngược 1 nhà cung cấp/vật tư (vật tư gắn nhiều nhà cung cấp chỉ
 *   giữ được nhà cung cấp có `id` nhỏ nhất — mô hình 1 - n không chứa nổi phần còn lại).
 */
export class MaterialSupplierManyToMany1783728000041 implements MigrationInterface {
  name = 'MaterialSupplierManyToMany1783728000041';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`material_supplier_tbl\` (
        \`material_id_column\` VARCHAR(36) NOT NULL,
        \`supplier_id_column\` VARCHAR(36) NOT NULL,
        PRIMARY KEY (\`material_id_column\`, \`supplier_id_column\`),
        INDEX \`IDX_material_supplier_supplier\` (\`supplier_id_column\`),
        CONSTRAINT \`FK_material_supplier_material\` FOREIGN KEY (\`material_id_column\`)
          REFERENCES \`material_tbl\` (\`id_column\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_material_supplier_supplier\` FOREIGN KEY (\`supplier_id_column\`)
          REFERENCES \`supplier_tbl\` (\`id_column\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      INSERT INTO \`material_supplier_tbl\` (\`material_id_column\`, \`supplier_id_column\`)
      SELECT \`id_column\`, \`supplier_id_column\`
      FROM \`material_tbl\`
      WHERE \`supplier_id_column\` IS NOT NULL;
    `);

    await queryRunner.query(
      `ALTER TABLE \`material_tbl\` DROP FOREIGN KEY \`FK_material_supplier\`;`,
    );
    await queryRunner.query(`ALTER TABLE \`material_tbl\` DROP INDEX \`IDX_material_supplier\`;`);
    await queryRunner.query(`ALTER TABLE \`material_tbl\` DROP COLUMN \`supplier_id_column\`;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`material_tbl\`
        ADD \`supplier_id_column\` VARCHAR(36) NULL,
        ADD INDEX \`IDX_material_supplier\` (\`supplier_id_column\`),
        ADD CONSTRAINT \`FK_material_supplier\`
          FOREIGN KEY (\`supplier_id_column\`) REFERENCES \`supplier_tbl\` (\`id_column\`)
          ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      UPDATE \`material_tbl\` m
      JOIN (
        SELECT \`material_id_column\`, MIN(\`supplier_id_column\`) AS \`supplier_id_column\`
        FROM \`material_supplier_tbl\`
        GROUP BY \`material_id_column\`
      ) ms ON ms.\`material_id_column\` = m.\`id_column\`
      SET m.\`supplier_id_column\` = ms.\`supplier_id_column\`;
    `);

    await queryRunner.query(`DROP TABLE \`material_supplier_tbl\`;`);
  }
}
