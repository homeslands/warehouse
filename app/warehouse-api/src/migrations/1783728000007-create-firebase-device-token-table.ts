import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFirebaseDeviceTokenTable1783728000007 implements MigrationInterface {
  name = 'CreateFirebaseDeviceTokenTable1783728000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`firebase_device_token_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`user_id_column\` VARCHAR(36) NOT NULL,
        \`token_column\` VARCHAR(255) NOT NULL,
        \`platform_column\` VARCHAR(255) NOT NULL,
        \`user_agent_column\` VARCHAR(255) NULL,
        \`user_column\` VARCHAR(36) NULL,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_firebase_device_token_slug\` (\`slug_column\`),
        UNIQUE INDEX \`IDX_firebase_device_token_token\` (\`token_column\`),
        INDEX \`IDX_firebase_device_token_user_id\` (\`user_id_column\`),
        PRIMARY KEY (\`id_column\`),
        CONSTRAINT \`FK_firebase_device_token_user\` FOREIGN KEY (\`user_column\`)
          REFERENCES \`user_tbl\` (\`id_column\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`firebase_device_token_tbl\`;`);
  }
}
