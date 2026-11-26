import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mã đơn vị hàng (`CodeType.Item`): 1 dòng phiếu nhập = 1 đơn vị hàng có mã riêng, sinh lúc thêm
 * vào phiếu nháp; xác nhận phiếu chép mã sang lô (1 dòng ⇒ 1 lô).
 *
 * - `import_form_item_tbl.code_column`, `material_batch_tbl.code_column`: VARCHAR(64) UNIQUE,
 *   NULL-able — dòng/lô có trước migration không có mã và KHÔNG backfill (mã cấp theo ngày nhập,
 *   cấp lại cho quá khứ là bịa số thứ tự). MySQL cho nhiều NULL trong UNIQUE.
 * - Bỏ UNIQUE (phiếu, vật tư, đơn vị): cùng vật tư/đơn vị giờ lặp lại 1 dòng mỗi đơn vị. Index đó
 *   đang là index của FK `FK_import_form_item_form` ⇒ tạo index (phiếu, dòng) TRƯỚC khi drop, nếu
 *   không MySQL từ chối ("needed in a foreign key constraint").
 *
 * Viết tay vì `typeorm:g` không dùng được trên repo này (xem CLAUDE.md). `down` dựng lại UNIQUE cũ —
 * sẽ lỗi nếu đã có phiếu lặp (vật tư, đơn vị); khi đó phải gộp dòng bằng tay trước khi revert.
 */
export class AddItemCode1783728000054 implements MigrationInterface {
  name = 'AddItemCode1783728000054';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`import_form_item_tbl\`
        ADD COLUMN \`code_column\` VARCHAR(64) NULL AFTER \`line_no_column\`,
        ADD UNIQUE INDEX \`UQ_import_form_item_code\` (\`code_column\`),
        ADD INDEX \`IDX_import_form_item_form_line\` (\`import_form_id_column\`, \`line_no_column\`);
    `);
    await queryRunner.query(
      `ALTER TABLE \`import_form_item_tbl\` DROP INDEX \`UQ_import_form_item\`;`,
    );
    await queryRunner.query(`
      ALTER TABLE \`material_batch_tbl\`
        ADD COLUMN \`code_column\` VARCHAR(64) NULL AFTER \`import_form_item_id_column\`,
        ADD UNIQUE INDEX \`UQ_material_batch_code\` (\`code_column\`);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`material_batch_tbl\`
        DROP INDEX \`UQ_material_batch_code\`,
        DROP COLUMN \`code_column\`;
    `);
    await queryRunner.query(`
      ALTER TABLE \`import_form_item_tbl\`
        ADD UNIQUE INDEX \`UQ_import_form_item\` (\`import_form_id_column\`, \`material_id_column\`, \`unit_id_column\`);
    `);
    await queryRunner.query(`
      ALTER TABLE \`import_form_item_tbl\`
        DROP INDEX \`IDX_import_form_item_form_line\`,
        DROP INDEX \`UQ_import_form_item_code\`,
        DROP COLUMN \`code_column\`;
    `);
  }
}
