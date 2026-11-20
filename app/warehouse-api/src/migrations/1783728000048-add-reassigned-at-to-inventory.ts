import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm `reassigned_at_column` vào `inventory_tbl` để giữ nguyên `created_at_column` (ngày gán ban
 * đầu) khi khôi phục dòng tồn đã xoá mềm, đồng thời lưu thời điểm gán lại gần nhất để sắp xếp
 * danh sách tồn kho.
 */
export class AddReassignedAtToInventory1783728000048 implements MigrationInterface {
  name = 'AddReassignedAtToInventory1783728000048';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`inventory_tbl\`
        ADD COLUMN \`reassigned_at_column\` DATETIME(6) NULL
        AFTER \`maximum_inventory_column\`;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`inventory_tbl\` DROP COLUMN \`reassigned_at_column\`;`);
  }
}
