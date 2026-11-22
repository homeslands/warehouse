import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bộ đếm sinh mã tự động (`src/code-generate/code-sequence.entity.ts`). Viết tay vì `typeorm:g`
 * không dùng được trên repo này (xem CLAUDE.md). Không có API nên không cần seed authority.
 *
 * - PK tổ hợp (loại mã, kho, ngày `yymmdd`) — vừa là khoá tra cứu, vừa là dòng bị
 *   `SELECT ... FOR UPDATE` khi sinh mã.
 * - FK tới kho RESTRICT: kho chỉ xoá mềm, bộ đếm phải còn để không cấp lại số cũ.
 */
export class CreateCodeSequenceTable1783728000047 implements MigrationInterface {
  name = 'CreateCodeSequenceTable1783728000047';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`code_sequence_tbl\` (
        \`type_column\` VARCHAR(32) NOT NULL,
        \`warehouse_id_column\` VARCHAR(36) NOT NULL,
        \`period_column\` CHAR(6) NOT NULL,
        \`last_value_column\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`type_column\`, \`warehouse_id_column\`, \`period_column\`),
        INDEX \`IDX_code_sequence_warehouse\` (\`warehouse_id_column\`),
        CONSTRAINT \`FK_code_sequence_warehouse\` FOREIGN KEY (\`warehouse_id_column\`)
          REFERENCES \`warehouse_tbl\` (\`id_column\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`code_sequence_tbl\`;`);
  }
}
