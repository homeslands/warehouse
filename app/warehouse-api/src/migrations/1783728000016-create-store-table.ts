import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStoreTable1783728000016 implements MigrationInterface {
  name = 'CreateStoreTable1783728000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`store_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`name_column\` VARCHAR(255) NOT NULL,
        \`code_column\` VARCHAR(32) NOT NULL,
        \`legal_name_column\` VARCHAR(255) NOT NULL,
        \`tax_code_column\` VARCHAR(14) NOT NULL,
        \`invoice_address_column\` VARCHAR(255) NULL,
        \`phonenumber_column\` VARCHAR(20) NULL,
        \`email_column\` VARCHAR(255) NULL,
        \`address_column\` VARCHAR(255) NULL,
        \`is_active_column\` TINYINT NOT NULL DEFAULT 1,
        \`version_column\` INT NOT NULL DEFAULT 1,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_store_slug\` (\`slug_column\`),
        UNIQUE INDEX \`IDX_store_code\` (\`code_column\`),
        INDEX \`IDX_store_tax_code\` (\`tax_code_column\`),
        PRIMARY KEY (\`id_column\`)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`store_tbl\`;`);
  }
}
