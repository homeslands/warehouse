import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserTable1783728000002 implements MigrationInterface {
  name = 'CreateUserTable1783728000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`user_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`phonenumber_column\` VARCHAR(20) NOT NULL,
        \`password_column\` VARCHAR(255) NOT NULL,
        \`is_active_column\` TINYINT NOT NULL DEFAULT 1,
        \`role_id_column\` VARCHAR(36) NOT NULL,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_user_slug\` (\`slug_column\`),
        UNIQUE INDEX \`IDX_user_phonenumber\` (\`phonenumber_column\`),
        PRIMARY KEY (\`id_column\`),
        CONSTRAINT \`FK_user_role\` FOREIGN KEY (\`role_id_column\`)
          REFERENCES \`role_tbl\` (\`id_column\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`user_tbl\`;`);
  }
}
