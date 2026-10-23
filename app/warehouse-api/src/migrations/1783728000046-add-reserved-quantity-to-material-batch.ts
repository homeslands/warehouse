import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lượng giữ chỗ trên lô cho phiếu xuất `PENDING` (`0 <= reserved <= remaining`, service gác). Lô cũ
 * = 0: trước migration này chưa có phiếu nào giữ chỗ. Cột `status_column` của phiếu xuất là
 * VARCHAR(16) nên trạng thái mới `PENDING` không cần đổi schema.
 */
export class AddReservedQuantityToMaterialBatch1783728000046 implements MigrationInterface {
  name = 'AddReservedQuantityToMaterialBatch1783728000046';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`material_batch_tbl\`
        ADD COLUMN \`reserved_quantity_column\` DECIMAL(18,6) NOT NULL DEFAULT 0
        AFTER \`remaining_quantity_column\`;
    `);
  }

  /** Huỷ hết phiếu `PENDING` trước khi revert — không thì mất dấu phần đang giữ chỗ trên lô. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`material_batch_tbl\` DROP COLUMN \`reserved_quantity_column\`;`,
    );
  }
}
