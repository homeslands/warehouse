import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đổi tồn kho và ngưỡng tồn từ `INT` sang `DECIMAL(18,6)`.
 *
 * Lý do: từ khi vật tư có đơn vị quy đổi (`conversion_rate` DECIMAL(18,6)), số lượng nhập theo đơn
 * vị NHỎ HƠN đơn vị cơ sở luôn ra số lẻ — nhập 1 KG cho vật tư base = BAO (1 BAO = 50 KG) ra
 * 0.02 BAO, cột `INT` làm tròn về 0 và hàng biến mất không dấu vết. Scale 6 chọn bằng đúng scale
 * của `conversion_rate` để phép quy đổi không mất chính xác ở bước nào.
 *
 * `DECIMAL` không đổi cách cộng/trừ tồn: `WarehouseMaterialService.adjustQuantity` vẫn là 1 câu
 * UPDATE nguyên tử `quantity_column + (delta) >= 0`.
 */
export class QuantityToDecimal1783728000021 implements MigrationInterface {
  name = 'QuantityToDecimal1783728000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`material_tbl\`
        MODIFY COLUMN \`minimum_inventory_column\` DECIMAL(18,6) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`maximum_inventory_column\` DECIMAL(18,6) NOT NULL DEFAULT 0;
    `);
    await queryRunner.query(`
      ALTER TABLE \`warehouse_material_tbl\`
        MODIFY COLUMN \`quantity_column\` DECIMAL(18,6) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`minimum_inventory_column\` DECIMAL(18,6) NULL,
        MODIFY COLUMN \`maximum_inventory_column\` DECIMAL(18,6) NULL;
    `);
  }

  /**
   * Quay lại `INT` là thao tác MẤT DỮ LIỆU nếu đã có số lẻ (MySQL làm tròn). Chỉ chạy khi chắc chắn
   * chưa phát sinh tồn lẻ.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`warehouse_material_tbl\`
        MODIFY COLUMN \`quantity_column\` INT NOT NULL DEFAULT 0,
        MODIFY COLUMN \`minimum_inventory_column\` INT NULL,
        MODIFY COLUMN \`maximum_inventory_column\` INT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE \`material_tbl\`
        MODIFY COLUMN \`minimum_inventory_column\` INT NOT NULL DEFAULT 0,
        MODIFY COLUMN \`maximum_inventory_column\` INT NOT NULL DEFAULT 0;
    `);
  }
}
