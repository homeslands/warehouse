import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hạn dùng (không bắt buộc) trên dòng phiếu nhập — xác nhận phiếu chép sang lô
 * (`material_batch_tbl.expiry_date_column`). Dòng cũ để NULL (= không có hạn dùng).
 */
export class AddExpiryDateToImportFormItem1783728000043 implements MigrationInterface {
  name = 'AddExpiryDateToImportFormItem1783728000043';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`import_form_item_tbl\`
        ADD COLUMN \`expiry_date_column\` DATE NULL AFTER \`note_column\`;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`import_form_item_tbl\` DROP COLUMN \`expiry_date_column\`;`,
    );
  }
}
