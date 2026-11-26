import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `warehouse_tbl.warehouse_no_column` — số kho 1-999, cấp tự động lúc tạo kho, không đổi. Là phần
 * số của mã kho tự sinh `{WAREHOUSE prefix}-{warehouseNo:3}` (vd `WH-001`) và 3 chữ số kho trong
 * mã vạch EAN-13 (trước đây tính động = thứ tự tạo kho, không lưu).
 *
 * Backfill đúng công thức cũ của `CodeGenerateService.barcodeWarehouseNo`: xếp MỌI kho (kể cả xoá
 * mềm) theo `created_at`, hoà thì theo `id` ⇒ mã vạch đã cấp trước migration giữ nguyên nghĩa. Mã
 * kho (`code_column`) của kho cũ KHÔNG đổi — chỉ kho tạo mới mới nhận mã tự sinh.
 *
 * Seed quy tắc `WAREHOUSE` = `WH` vào `code_rule_tbl` (chép cứng, không import hằng — xem migration
 * `1783728000049`). Viết tay vì `typeorm:g` không dùng được trên repo này (xem CLAUDE.md).
 */
export class AddWarehouseNo1783728000052 implements MigrationInterface {
  name = 'AddWarehouseNo1783728000052';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`warehouse_tbl\`
        ADD COLUMN \`warehouse_no_column\` SMALLINT UNSIGNED NULL AFTER \`code_column\`;
    `);
    await queryRunner.query(`
      UPDATE \`warehouse_tbl\` w
      JOIN (
        SELECT \`id_column\`,
               ROW_NUMBER() OVER (ORDER BY \`created_at_column\`, \`id_column\`) AS rn
        FROM \`warehouse_tbl\`
      ) ordered ON ordered.\`id_column\` = w.\`id_column\`
      SET w.\`warehouse_no_column\` = ordered.rn;
    `);
    await queryRunner.query(`
      ALTER TABLE \`warehouse_tbl\`
        MODIFY COLUMN \`warehouse_no_column\` SMALLINT UNSIGNED NOT NULL,
        ADD UNIQUE INDEX \`UQ_warehouse_no\` (\`warehouse_no_column\`);
    `);
    await queryRunner.query(
      'INSERT INTO `code_rule_tbl` (`type_column`, `prefix_column`, `description_column`) VALUES (?, ?, ?)',
      ['WAREHOUSE', 'WH', 'Warehouse code ({prefix}-{warehouseNo:3})'],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DELETE FROM `code_rule_tbl` WHERE `type_column` = 'WAREHOUSE'");
    await queryRunner.query(`
      ALTER TABLE \`warehouse_tbl\`
        DROP INDEX \`UQ_warehouse_no\`,
        DROP COLUMN \`warehouse_no_column\`;
    `);
  }
}
