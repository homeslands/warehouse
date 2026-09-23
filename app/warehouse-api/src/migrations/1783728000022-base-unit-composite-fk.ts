import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đổi mô hình ĐƠN VỊ CƠ SỞ: từ "một FK riêng trỏ sang `unit_tbl`, nằm NGOÀI danh sách đơn vị quy
 * đổi" thành "một DÒNG của `material_unit_can_have_tbl` với `conversion_rate = 1`, còn
 * `material_tbl.base_unit_id_column` chỉ là con trỏ chỉ ra dòng nào".
 *
 * Mấu chốt là thay FK 1 cột bằng **FK TỔ HỢP** `(id, base_unit_id) -> (material_id, unit_id)`.
 * Đổi lại được 4 ràng buộc ở tầng DB, không cần service gác:
 *
 * 1. Base unit chắc chắn là 1 đơn vị CỦA CHÍNH vật tư đó (không trỏ sang unit lạ).
 * 2. Mỗi vật tư có ĐÚNG 1 base unit — vì đó là 1 cột đơn trị.
 * 3. `ON DELETE RESTRICT` ⇒ không gỡ được dòng join đang làm đơn vị cơ sở.
 * 4. Phiếu nhập/xuất sau này chỉ cần FK tổ hợp `(material_id, unit_id)` vào cùng bảng ⇒ DB tự chặn
 *    ghi phiếu bằng đơn vị không thuộc vật tư, kể cả khi đó là đơn vị chính.
 *
 * `base_unit_id_column` vẫn NULL-able: InnoDB bỏ qua check khi một vế của FK tổ hợp là NULL, nên
 * vật tư chưa khai đơn vị cơ sở vẫn hợp lệ.
 *
 * Bước BACKFILL ở đầu `up()` là bắt buộc: theo mô hình cũ, base unit KHÔNG có dòng trong bảng join,
 * nên thêm thẳng FK tổ hợp sẽ hỏng (`errno 1452`) ở mọi vật tư đã khai đơn vị cơ sở.
 */
export class BaseUnitCompositeFk1783728000022 implements MigrationInterface {
  name = 'BaseUnitCompositeFk1783728000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Mỗi base unit đang có phải xuất hiện thành 1 dòng join (rate = 1). Gồm cả vật tư đã xoá
    //    mềm — FK dưới DB không biết tới `deleted_at_column`.
    await queryRunner.query(`
      INSERT INTO \`material_unit_can_have_tbl\`
        (\`material_id_column\`, \`unit_id_column\`, \`conversion_rate_column\`)
      SELECT \`id_column\`, \`base_unit_id_column\`, 1
        FROM \`material_tbl\`
       WHERE \`base_unit_id_column\` IS NOT NULL
      ON DUPLICATE KEY UPDATE \`conversion_rate_column\` = 1;
    `);

    // 2. Đổi FK: bỏ bản 1 cột trỏ sang \`unit_tbl\`, dựng FK tổ hợp trỏ vào bảng join. Index cũ phải
    //    thay bằng index (id, base_unit_id) — InnoDB đòi phía THAM CHIẾU có index dẫn đầu đúng thứ
    //    tự cột của FK.
    await queryRunner.query(`
      ALTER TABLE \`material_tbl\` DROP FOREIGN KEY \`FK_material_base_unit\`;
    `);
    await queryRunner.query(`
      DROP INDEX \`IDX_material_base_unit\` ON \`material_tbl\`;
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_material_base_unit\`
        ON \`material_tbl\` (\`id_column\`, \`base_unit_id_column\`);
    `);
    await queryRunner.query(`
      ALTER TABLE \`material_tbl\`
        ADD CONSTRAINT \`FK_material_base_unit\`
        FOREIGN KEY (\`id_column\`, \`base_unit_id_column\`)
        REFERENCES \`material_unit_can_have_tbl\` (\`material_id_column\`, \`unit_id_column\`)
        ON DELETE RESTRICT ON UPDATE CASCADE;
    `);
  }

  /**
   * Quay lại mô hình cũ: bỏ FK tổ hợp, dựng lại FK 1 cột sang `unit_tbl`, rồi XOÁ các dòng join của
   * chính đơn vị cơ sở để khôi phục bất biến cũ ("base unit không nằm trong danh sách quy đổi").
   * Bước xoá đó là MẤT DỮ LIỆU nếu ai đó đã sửa tỉ lệ của dòng base — theo thiết kế thì tỉ lệ ấy
   * luôn là 1 nên không mất gì, nhưng đừng chạy `down` trên DB đã bị sửa tay.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`material_tbl\` DROP FOREIGN KEY \`FK_material_base_unit\`;
    `);
    await queryRunner.query(`
      DROP INDEX \`IDX_material_base_unit\` ON \`material_tbl\`;
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_material_base_unit\` ON \`material_tbl\` (\`base_unit_id_column\`);
    `);
    await queryRunner.query(`
      ALTER TABLE \`material_tbl\`
        ADD CONSTRAINT \`FK_material_base_unit\`
        FOREIGN KEY (\`base_unit_id_column\`) REFERENCES \`unit_tbl\` (\`id_column\`)
        ON DELETE RESTRICT ON UPDATE CASCADE;
    `);
    await queryRunner.query(`
      DELETE \`mu\` FROM \`material_unit_can_have_tbl\` \`mu\`
        INNER JOIN \`material_tbl\` \`m\`
           ON \`m\`.\`id_column\` = \`mu\`.\`material_id_column\`
          AND \`m\`.\`base_unit_id_column\` = \`mu\`.\`unit_id_column\`;
    `);
  }
}
