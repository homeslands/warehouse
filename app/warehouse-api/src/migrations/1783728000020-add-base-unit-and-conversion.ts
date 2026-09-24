import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Viết TAY, không dùng `typeorm:g` (xem mục "Nợ kỹ thuật" trong `CLAUDE.md`).
 *
 * Phạm vi:
 * 1. `material_tbl.base_unit_id_column` — FK sang `unit_tbl`, là ĐƠN VỊ CƠ SỞ của vật tư.
 * 2. `material_unit_can_have_tbl` thêm `conversion_rate_column`.
 *
 * ĐÃ CHẠY — KHÔNG SỬA FILE NÀY. Mô hình đơn vị cơ sở sau đó đã đổi ở migration
 * `1783728000022`: base unit trở thành MỘT DÒNG của `material_unit_can_have_tbl` và khoá ngoại ở
 * đây được thay bằng FK TỔ HỢP. Đọc migration 22 để biết trạng thái hiện hành.
 *
 * `ON DELETE RESTRICT`: Unit chỉ bị xoá MỀM qua API (`UnitService.deleteUnit` đã chặn sẵn bằng
 * `UNIT_IN_USE`), nên RESTRICT ở đây là lưới an toàn cho đường xoá CỨNG dưới DB.
 */
export class AddBaseUnitAndConversion1783728000020 implements MigrationInterface {
  name = 'AddBaseUnitAndConversion1783728000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`material_tbl\`
        ADD COLUMN \`base_unit_id_column\` VARCHAR(36) NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_material_base_unit\` ON \`material_tbl\` (\`base_unit_id_column\`);
    `);
    await queryRunner.query(`
      ALTER TABLE \`material_tbl\`
        ADD CONSTRAINT \`FK_material_base_unit\`
        FOREIGN KEY (\`base_unit_id_column\`) REFERENCES \`unit_tbl\` (\`id_column\`)
        ON DELETE RESTRICT ON UPDATE CASCADE;
    `);

    // DEFAULT là bắt buộc: bảng join có thể đã có dòng, thêm cột NOT NULL không default sẽ hỏng.
    // `1` là giá trị trung tính (1 đơn vị = 1 đơn vị cơ sở).
    await queryRunner.query(`
      ALTER TABLE \`material_unit_can_have_tbl\`
        ADD COLUMN \`conversion_rate_column\` DECIMAL(18,6) NOT NULL DEFAULT 1;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`material_unit_can_have_tbl\`
        DROP COLUMN \`conversion_rate_column\`;
    `);
    await queryRunner.query(`
      ALTER TABLE \`material_tbl\` DROP FOREIGN KEY \`FK_material_base_unit\`;
    `);
    await queryRunner.query(`
      DROP INDEX \`IDX_material_base_unit\` ON \`material_tbl\`;
    `);
    await queryRunner.query(`
      ALTER TABLE \`material_tbl\` DROP COLUMN \`base_unit_id_column\`;
    `);
  }
}
