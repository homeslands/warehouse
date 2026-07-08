import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthorityTables1783728000000 implements MigrationInterface {
  name = 'CreateAuthorityTables1783728000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`authority_group_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`name_column\` VARCHAR(255) NOT NULL,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_authority_group_slug\` (\`slug_column\`),
        PRIMARY KEY (\`id_column\`)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE \`authority_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`name_column\` VARCHAR(255) NOT NULL,
        \`authority_group_id_column\` VARCHAR(36) NOT NULL,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_authority_slug\` (\`slug_column\`),
        PRIMARY KEY (\`id_column\`),
        CONSTRAINT \`FK_authority_authority_group\` FOREIGN KEY (\`authority_group_id_column\`)
          REFERENCES \`authority_group_tbl\` (\`id_column\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`authority_tbl\`;`);
    await queryRunner.query(`DROP TABLE \`authority_group_tbl\`;`);
  }
}
