import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quy tắc sinh mã (`src/code-generate/code-rule.entity.ts`) — tiền tố theo `CodeType`, trước đây
 * hard-code ở `CODE_TYPE_PREFIX`. Viết tay vì `typeorm:g` không dùng được trên repo này (xem CLAUDE.md).
 *
 * Seed đủ mọi `CodeType` với đúng tiền tố cũ ⇒ mã phiếu nhập/xuất sinh ra không đổi sau migrate.
 * Giá trị chép cứng (không import `DEFAULT_CODE_TYPE_PREFIX`) để migration không đổi nghĩa khi hằng
 * trong code đổi về sau. `BARCODE` = `20`: dải GS1 dành cho mã lưu hành nội bộ.
 */
const SEED: readonly [type: string, prefix: string, description: string][] = [
  ['ITEM', 'IT', 'Material code'],
  ['IMPORT_FORM', 'IM', 'Import form code'],
  ['EXPORT_FORM', 'EX', 'Export form code'],
  ['BALANCE_FORM', 'BL', 'Balance form code'],
  ['SHELF', 'SH', 'Shelf code'],
  ['BARCODE', '20', 'EAN-13 barcode for materials without a manufacturer barcode'],
];

export class CreateCodeRuleTable1783728000049 implements MigrationInterface {
  name = 'CreateCodeRuleTable1783728000049';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`code_rule_tbl\` (
        \`type_column\` VARCHAR(32) NOT NULL,
        \`prefix_column\` VARCHAR(2) NOT NULL,
        \`description_column\` VARCHAR(255) NULL,
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`type_column\`)
      ) ENGINE=InnoDB;
    `);
    for (const [type, prefix, description] of SEED) {
      await queryRunner.query(
        'INSERT INTO `code_rule_tbl` (`type_column`, `prefix_column`, `description_column`) VALUES (?, ?, ?)',
        [type, prefix, description],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`code_rule_tbl\`;`);
  }
}
