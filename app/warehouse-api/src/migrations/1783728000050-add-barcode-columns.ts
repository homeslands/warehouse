import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `material_tbl.barcode_column` — mã vạch quét được (nhà sản xuất) hoặc EAN-13 tự sinh. NULL-able
 * (vật tư cũ chưa có), UNIQUE (MySQL cho nhiều NULL). Chỉ vật tư có mã vạch: phiếu nhập/xuất chỉ có
 * `code`, kho không có cột nào cho mã vạch (số kho trong mã vạch tính từ thứ tự tạo kho, xem
 * `CodeGenerateService.barcodeWarehouseNo`).
 */
export class AddBarcodeColumns1783728000050 implements MigrationInterface {
  name = 'AddBarcodeColumns1783728000050';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`material_tbl\`
        ADD COLUMN \`barcode_column\` VARCHAR(14) NULL AFTER \`code_column\`,
        ADD UNIQUE INDEX \`UQ_material_barcode\` (\`barcode_column\`);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`material_tbl\`
        DROP INDEX \`UQ_material_barcode\`,
        DROP COLUMN \`barcode_column\`;
    `);
  }
}
