import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVersionToExampleTable1783728000008 implements MigrationInterface {
  name = 'AddVersionToExampleTable1783728000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`example_tbl\`
        ADD COLUMN \`version_column\` INT NOT NULL DEFAULT 1;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`example_tbl\` DROP COLUMN \`version_column\`;`);
  }
}
