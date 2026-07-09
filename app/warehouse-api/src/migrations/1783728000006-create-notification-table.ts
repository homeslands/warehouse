import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationTable1783728000006 implements MigrationInterface {
  name = 'CreateNotificationTable1783728000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`notification_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`title_column\` VARCHAR(255) NULL,
        \`body_column\` VARCHAR(255) NULL,
        \`link_column\` VARCHAR(255) NULL,
        \`language_column\` VARCHAR(255) NOT NULL DEFAULT 'vi',
        \`message_column\` VARCHAR(255) NOT NULL,
        \`is_read_column\` TINYINT NOT NULL DEFAULT 0,
        \`sender_id_column\` VARCHAR(36) NULL,
        \`receiver_id_column\` VARCHAR(36) NOT NULL,
        \`receiver_name_column\` VARCHAR(255) NULL,
        \`sender_name_column\` VARCHAR(255) NULL,
        \`type_column\` VARCHAR(255) NOT NULL,
        \`metadata_column\` JSON NULL,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_notification_slug\` (\`slug_column\`),
        INDEX \`IDX_notification_receiver\` (\`receiver_id_column\`),
        PRIMARY KEY (\`id_column\`)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`notification_tbl\`;`);
  }
}
