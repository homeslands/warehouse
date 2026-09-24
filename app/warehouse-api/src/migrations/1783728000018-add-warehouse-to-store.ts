import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWarehouseToStore1783728000018 implements MigrationInterface {
  name = 'AddWarehouseToStore1783728000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Quan hệ 1-1 `Store <-> Warehouse`: cột FK nằm ở `store_tbl` (owning side). NULL được — cửa
    // hàng chưa gắn kho là trạng thái hợp lệ, và cột phải nullable để chạy được trên dữ liệu đang có.
    await queryRunner.query(`
      ALTER TABLE \`store_tbl\`
        ADD COLUMN \`warehouse_id_column\` VARCHAR(36) NULL;
    `);

    // UNIQUE (không phải INDEX thường như \`IDX_warehouse_manager\`): đây chính là thứ biến quan hệ
    // thành 1-1 ở tầng DB — 2 cửa hàng không thể cùng trỏ vào 1 kho. MySQL cho phép nhiều NULL nên
    // nhiều cửa hàng chưa gắn kho vẫn hợp lệ.
    await queryRunner.query(`
      ALTER TABLE \`store_tbl\`
        ADD UNIQUE INDEX \`UQ_store_warehouse\` (\`warehouse_id_column\`);
    `);

    // ON DELETE SET NULL, giống \`FK_warehouse_manager\`: "cửa hàng chưa có kho" là trạng thái hợp lệ
    // theo thiết kế, nên xoá cứng kho nên thoái hoá về trạng thái đó thay vì chặn cứng.
    await queryRunner.query(`
      ALTER TABLE \`store_tbl\`
        ADD CONSTRAINT \`FK_store_warehouse\`
        FOREIGN KEY (\`warehouse_id_column\`) REFERENCES \`warehouse_tbl\` (\`id_column\`)
        ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`store_tbl\` DROP FOREIGN KEY \`FK_store_warehouse\`;`);
    await queryRunner.query(`ALTER TABLE \`store_tbl\` DROP INDEX \`UQ_store_warehouse\`;`);
    await queryRunner.query(`ALTER TABLE \`store_tbl\` DROP COLUMN \`warehouse_id_column\`;`);
  }
}
