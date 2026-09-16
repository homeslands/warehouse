import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTaxProfileTable1783728000017 implements MigrationInterface {
  name = 'CreateTaxProfileTable1783728000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Không FK tới `store_tbl`: `taxCode` là khoá tự nhiên độc lập, tra cứu được mã số thuế chưa
    // gắn với store nào (xem `docs/specs/tax-profile.md`).
    await queryRunner.query(`
      CREATE TABLE \`tax_profile_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`tax_code_column\` VARCHAR(14) NOT NULL,
        \`name_column\` VARCHAR(255) NOT NULL,
        \`international_name_column\` VARCHAR(255) NULL,
        \`short_name_column\` VARCHAR(255) NULL,
        \`address_column\` VARCHAR(500) NULL,
        \`status_column\` VARCHAR(255) NULL,
        \`source_updated_at_column\` DATETIME NULL,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_tax_profile_slug\` (\`slug_column\`),
        UNIQUE INDEX \`IDX_tax_profile_tax_code\` (\`tax_code_column\`),
        PRIMARY KEY (\`id_column\`)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`tax_profile_tbl\`;`);
  }
}
