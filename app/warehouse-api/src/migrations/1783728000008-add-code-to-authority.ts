import { MigrationInterface, QueryRunner } from 'typeorm';

// Tách khoá tra cứu quyền (dùng trong @RequireAuthority(code)) khỏi `slug` sẵn có của Base —
// xem docs/specs/authority-permission.md mục "Entity / dữ liệu".
export class AddCodeToAuthority1783728000008 implements MigrationInterface {
  name = 'AddCodeToAuthority1783728000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`authority_tbl\`
      ADD \`code_column\` VARCHAR(255) NOT NULL,
      ADD UNIQUE INDEX \`IDX_authority_code\` (\`code_column\`);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`authority_tbl\` DROP INDEX \`IDX_authority_code\`;`);
    await queryRunner.query(`ALTER TABLE \`authority_tbl\` DROP COLUMN \`code_column\`;`);
  }
}
