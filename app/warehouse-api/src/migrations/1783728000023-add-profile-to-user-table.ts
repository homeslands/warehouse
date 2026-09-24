import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfileToUserTable1783728000023 implements MigrationInterface {
  name = 'AddProfileToUserTable1783728000023';

  // `DEFAULT ''` cho first/last name: bảng đã có dữ liệu (ít nhất là root user do seeder tạo), thêm
  // cột NOT NULL không default sẽ lỗi ở strict mode. User cũ sẽ có tên rỗng cho tới khi được cập nhật.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`user_tbl\`
        ADD COLUMN \`first_name_column\` VARCHAR(255) NOT NULL DEFAULT '' AFTER \`phonenumber_column\`,
        ADD COLUMN \`last_name_column\` VARCHAR(255) NOT NULL DEFAULT '' AFTER \`first_name_column\`,
        ADD COLUMN \`dob_column\` DATE NULL AFTER \`last_name_column\`,
        ADD COLUMN \`email_column\` VARCHAR(255) NULL AFTER \`dob_column\`,
        ADD COLUMN \`address_column\` VARCHAR(255) NULL AFTER \`email_column\`;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`user_tbl\`
        DROP COLUMN \`address_column\`,
        DROP COLUMN \`email_column\`,
        DROP COLUMN \`dob_column\`,
        DROP COLUMN \`last_name_column\`,
        DROP COLUMN \`first_name_column\`;
    `);
  }
}
