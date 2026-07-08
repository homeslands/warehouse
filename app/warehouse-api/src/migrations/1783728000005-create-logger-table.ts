import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLoggerTable1783728000005 implements MigrationInterface {
  name = 'CreateLoggerTable1783728000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`logger_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`level_column\` VARCHAR(255) NOT NULL,
        \`message_column\` TEXT NOT NULL,
        \`context_column\` VARCHAR(255) NULL,
        \`timestamp_column\` VARCHAR(255) NOT NULL,
        \`pid_column\` INT NOT NULL,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_logger_slug\` (\`slug_column\`),
        PRIMARY KEY (\`id_column\`)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`logger_tbl\`;`);
  }
}
