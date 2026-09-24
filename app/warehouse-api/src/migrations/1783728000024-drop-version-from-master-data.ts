import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bỏ optimistic lock (`version_column`) khỏi các bảng danh mục/master data — `VersionedBase` từ nay
 * chỉ dành cho phiếu nhập/xuất/kiểm kho (sửa nhiều dòng qua form, xung đột mới thực sự gây hại).
 * Các entity này chuyển về `Base`: PATCH không còn nhận `version`, người sửa sau thắng.
 */
const TABLES = ['warehouse_tbl', 'store_tbl', 'unit_tbl', 'material_type_tbl', 'material_tbl'];

export class DropVersionFromMasterData1783728000024 implements MigrationInterface {
  name = 'DropVersionFromMasterData1783728000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`version_column\`;`);
    }
  }

  // Giá trị version cũ không khôi phục được — mọi dòng quay về 1, client phải GET lại trước khi PATCH.
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`version_column\` INT NOT NULL DEFAULT 1 AFTER \`slug_column\`;`,
      );
    }
  }
}
