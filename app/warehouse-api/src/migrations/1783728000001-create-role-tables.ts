import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRoleTables1783728000001 implements MigrationInterface {
  name = 'CreateRoleTables1783728000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`role_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`name_column\` ENUM('CUSTOMER','STAFF','CASHIER','CHEF','MANAGER','ADMIN','SUPER_ADMIN','TELESALE') NOT NULL,
        \`description_column\` VARCHAR(255) NULL,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_role_slug\` (\`slug_column\`),
        PRIMARY KEY (\`id_column\`)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE \`permission_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`role_id_column\` VARCHAR(36) NOT NULL,
        \`authority_id_column\` VARCHAR(36) NOT NULL,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_permission_slug\` (\`slug_column\`),
        PRIMARY KEY (\`id_column\`),
        CONSTRAINT \`FK_permission_role\` FOREIGN KEY (\`role_id_column\`)
          REFERENCES \`role_tbl\` (\`id_column\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_permission_authority\` FOREIGN KEY (\`authority_id_column\`)
          REFERENCES \`authority_tbl\` (\`id_column\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`permission_tbl\`;`);
    await queryRunner.query(`DROP TABLE \`role_tbl\`;`);
  }
}
