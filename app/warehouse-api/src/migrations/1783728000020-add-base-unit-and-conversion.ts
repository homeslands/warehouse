import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Viết TAY, không dùng `typeorm:g` (xem mục "Nợ kỹ thuật" trong `CLAUDE.md`).
 *
 * Phạm vi:
 * 1. `material_tbl.base_unit_id_column` — FK sang `unit_tbl`, là ĐƠN VỊ CƠ SỞ của vật tư.
 * 2. `material_unit_can_have_tbl` thêm `conversion_rate_column`.
 *
 * `base_unit_id_column` là NULL-able và index THƯỜNG (không UNIQUE): bảng đã có dữ liệu nên không
 * thể NOT NULL, và nhiều vật tư được phép dùng chung 1 đơn vị cơ sở. Ràng buộc "mỗi vật tư 1 base
 * unit, base unit không đồng thời là đơn vị quy đổi của chính nó" là quy tắc nghiệp vụ, DB không
 * biểu diễn được bằng 1 index — nó nằm ở `MaterialService`
 * (`MATERIAL_BASE_UNIT_IS_CONVERSION_UNIT`).
 *
 * `ON DELETE RESTRICT`: Unit chỉ bị xoá MỀM qua API (`UnitService.deleteUnit` đã chặn sẵn bằng
 * `UNIT_IN_USE`), nên RESTRICT ở đây là lưới an toàn cho đường xoá CỨNG dưới DB — khác với bảng
 * join dùng CASCADE, vì mất base unit là mất luôn ý nghĩa của mọi `conversion_rate` đã lưu.
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
