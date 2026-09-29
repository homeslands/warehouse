import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { getRandomString } from 'src/app/app.subscriber';

/**
 * Dữ liệu nhà cung cấp mẫu. Idempotent theo `code_column` (kiểm tra tồn tại trước khi INSERT) để
 * chạy lại sau `typeorm:rv` không vỡ UNIQUE, và không đè lên bản ghi đã sửa tay qua API.
 * `down()` chỉ xoá đúng các `code` seed ở đây và chỉ khi chưa có giao dịch/vật tư tham chiếu.
 */
const SUPPLIER_SEED = [
  {
    code: 'NCC-HP-01',
    name: 'Công ty TNHH Thép Hoà Phát',
    taxCode: '0900189284',
    phonenumber: '02213942884',
    email: 'lienhe@hoaphat.example.vn',
    address: 'KCN Phố Nối A, Văn Lâm, Hưng Yên',
    contactPerson: 'Nguyễn Văn An',
  },
  {
    code: 'NCC-XM-01',
    name: 'Công ty CP Xi măng Hà Tiên',
    taxCode: '0302067898',
    phonenumber: '02838151366',
    email: 'sales@hatien.example.vn',
    address: '360 Bến Chương Dương, Quận 1, TP. Hồ Chí Minh',
    contactPerson: 'Trần Thị Bình',
  },
  {
    code: 'NCC-SO-01',
    name: 'Công ty TNHH Sơn Đông Á',
    taxCode: '0101234567',
    phonenumber: '02435551234',
    email: 'kinhdoanh@donga.example.vn',
    address: 'Số 12, Cầu Giấy, Hà Nội',
    contactPerson: 'Lê Minh Châu',
  },
] as const;

export class SeedSuppliers1783728000033 implements MigrationInterface {
  name = 'SeedSuppliers1783728000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const supplier of SUPPLIER_SEED) {
      const [existing] = await queryRunner.query(
        `SELECT \`id_column\` FROM \`supplier_tbl\` WHERE \`code_column\` = ? LIMIT 1`,
        [supplier.code],
      );
      if (existing) continue;
      await queryRunner.query(
        `INSERT INTO \`supplier_tbl\`
           (\`id_column\`, \`slug_column\`, \`code_column\`, \`name_column\`, \`tax_code_column\`,
            \`phonenumber_column\`, \`email_column\`, \`address_column\`, \`contact_person_column\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          getRandomString(),
          supplier.code,
          supplier.name,
          supplier.taxCode,
          supplier.phonenumber,
          supplier.email,
          supplier.address,
          supplier.contactPerson,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const codes = SUPPLIER_SEED.map((supplier) => supplier.code);
    await queryRunner.query(
      `DELETE s FROM \`supplier_tbl\` s
       WHERE s.\`code_column\` IN (?)
         AND NOT EXISTS (SELECT 1 FROM \`supplier_transaction_tbl\` t WHERE t.\`supplier_id_column\` = s.\`id_column\`)
         AND NOT EXISTS (SELECT 1 FROM \`material_tbl\` m WHERE m.\`supplier_id_column\` = s.\`id_column\`)`,
      [codes],
    );
  }
}
