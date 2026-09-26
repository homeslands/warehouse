import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm cấp (`level_column`) cho role — số lớn = cấp cao. Cách khoảng 10 để chèn role mới vào giữa
 * mà không phải đánh số lại. `SUPER_ADMIN` để hẳn 100 vì nó bypass mọi check cấp trong code; con số
 * chỉ để hiển thị/sắp xếp.
 */
const LEVELS: Record<string, number> = {
  SUPERVISOR: 10,
  MANAGER: 20,
  ADMIN: 30,
  SUPER_ADMIN: 100,
};

export class AddLevelToRole1783728000028 implements MigrationInterface {
  name = 'AddLevelToRole1783728000028';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`role_tbl\` ADD COLUMN \`level_column\` INT NOT NULL DEFAULT 0 AFTER \`description_column\`;`,
    );
    for (const [name, level] of Object.entries(LEVELS)) {
      await queryRunner.query(
        `UPDATE \`role_tbl\` SET \`level_column\` = ? WHERE \`name_column\` = ?`,
        [level, name],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`role_tbl\` DROP COLUMN \`level_column\`;`);
  }
}
