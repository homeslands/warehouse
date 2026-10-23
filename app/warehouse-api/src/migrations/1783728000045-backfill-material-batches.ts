import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { getRandomString } from 'src/app/app.subscriber';

/** Đánh dấu row do migration này sinh, để `down` chỉ xoá đúng chúng (không đụng lô sinh sau). */
const BACKFILL_MARK = 'migration:1783728000045';

interface ConfirmedImportLine {
  item_id: string;
  material_id: string;
  warehouse_id: string;
  entry_date: string;
  base_quantity: string;
}

/**
 * Sinh lô cho mọi dòng của phiếu nhập đã `CONFIRMED` trước khi có bảng lô: 1 dòng ⇒ 1 lô còn
 * nguyên (`remaining = quantity = base_quantity`), ngày nhập = ngày phiếu, không có hạn dùng (dòng
 * cũ chưa có cột `expiry_date_column`). Bỏ qua phiếu/dòng đã xoá mềm và dòng đã có lô.
 *
 * Giới hạn đã biết: tồn sinh ra từ gán/điều chỉnh tay (`ASSIGN`/`ADJUST`) không có dòng phiếu nhập
 * nên không có lô — xuất lượng đó sẽ báo `MATERIAL_BATCH_INSUFFICIENT`. Tồn đã bị điều chỉnh giảm
 * sau khi nhập thì tổng lô có thể lớn hơn tồn; xác nhận phiếu xuất vẫn an toàn vì kiểm cả hai.
 */
export class BackfillMaterialBatches1783728000045 implements MigrationInterface {
  name = 'BackfillMaterialBatches1783728000045';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const lines: ConfirmedImportLine[] = await queryRunner.query(`
      SELECT
        i.\`id_column\` AS item_id,
        i.\`material_id_column\` AS material_id,
        f.\`warehouse_id_column\` AS warehouse_id,
        DATE_FORMAT(f.\`date_column\`, '%Y-%m-%d') AS entry_date,
        i.\`base_quantity_column\` AS base_quantity
      FROM \`import_form_item_tbl\` i
      JOIN \`import_form_tbl\` f ON f.\`id_column\` = i.\`import_form_id_column\`
      LEFT JOIN \`material_batch_tbl\` b ON b.\`import_form_item_id_column\` = i.\`id_column\`
      WHERE f.\`status_column\` = 'CONFIRMED'
        AND f.\`deleted_at_column\` IS NULL
        AND i.\`deleted_at_column\` IS NULL
        AND b.\`id_column\` IS NULL
      ORDER BY f.\`date_column\`, i.\`line_no_column\`
    `);

    for (const line of lines) {
      const quantity = Number(line.base_quantity);
      await queryRunner.query(
        `INSERT INTO \`material_batch_tbl\` (
          \`id_column\`, \`slug_column\`, \`material_id_column\`, \`warehouse_id_column\`,
          \`import_form_item_id_column\`, \`entry_date_column\`, \`expiry_date_column\`,
          \`quantity_column\`, \`remaining_quantity_column\`, \`status_column\`, \`created_by_column\`
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
        [
          uuidv4(),
          getRandomString(),
          line.material_id,
          line.warehouse_id,
          line.item_id,
          line.entry_date,
          line.base_quantity,
          line.base_quantity,
          quantity > 0 ? 1 : 0,
          BACKFILL_MARK,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM \`material_batch_tbl\` WHERE \`created_by_column\` = ?`, [
      BACKFILL_MARK,
    ]);
  }
}
