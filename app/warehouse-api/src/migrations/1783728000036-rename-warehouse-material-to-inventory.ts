import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đổi `warehouse_material_tbl` → `inventory_tbl` (entity `Inventory`, `src/inventory/`) và thêm
 * `reserved_quantity_column` (lượng đã giữ chỗ cho phiếu xuất, mặc định 0 cho mọi dòng cũ). Viết
 * tay vì `typeorm:g` không dùng được trên repo này (xem CLAUDE.md).
 *
 * `RENAME TABLE` giữ nguyên dữ liệu và FK trỏ ra ngoài; tên index/FK đặt thủ công ở migration
 * `1783728000015` thì phải đổi theo cho khớp tên mới. FK không có `RENAME CONSTRAINT` trong MySQL
 * nên DROP + ADD lại, giữ nguyên `ON DELETE` cũ (CASCADE theo kho, RESTRICT theo vật tư).
 *
 * Migration cũ (`015`, `021`) vẫn trỏ `warehouse_material_tbl` — revert lùi qua migration này là
 * đổi lại tên cũ nên `down()` của chúng vẫn chạy đúng.
 */
export class RenameWarehouseMaterialToInventory1783728000036 implements MigrationInterface {
  name = 'RenameWarehouseMaterialToInventory1783728000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`RENAME TABLE \`warehouse_material_tbl\` TO \`inventory_tbl\`;`);

    await queryRunner.query(`
      ALTER TABLE \`inventory_tbl\`
        DROP FOREIGN KEY \`FK_warehouse_material_warehouse\`,
        DROP FOREIGN KEY \`FK_warehouse_material_material\`;
    `);
    await queryRunner.query(`
      ALTER TABLE \`inventory_tbl\`
        RENAME INDEX \`IDX_warehouse_material_slug\` TO \`IDX_inventory_slug\`,
        RENAME INDEX \`UQ_warehouse_material\` TO \`UQ_inventory\`,
        RENAME INDEX \`IDX_warehouse_material_material\` TO \`IDX_inventory_material\`;
    `);
    await queryRunner.query(`
      ALTER TABLE \`inventory_tbl\`
        ADD CONSTRAINT \`FK_inventory_warehouse\`
          FOREIGN KEY (\`warehouse_id_column\`) REFERENCES \`warehouse_tbl\` (\`id_column\`)
          ON DELETE CASCADE,
        ADD CONSTRAINT \`FK_inventory_material\`
          FOREIGN KEY (\`material_id_column\`) REFERENCES \`material_tbl\` (\`id_column\`)
          ON DELETE RESTRICT;
    `);

    await queryRunner.query(`
      ALTER TABLE \`inventory_tbl\`
        ADD COLUMN \`reserved_quantity_column\` DECIMAL(18,6) NOT NULL DEFAULT 0
        AFTER \`quantity_column\`;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`inventory_tbl\` DROP COLUMN \`reserved_quantity_column\`;`,
    );

    await queryRunner.query(`
      ALTER TABLE \`inventory_tbl\`
        DROP FOREIGN KEY \`FK_inventory_warehouse\`,
        DROP FOREIGN KEY \`FK_inventory_material\`;
    `);
    await queryRunner.query(`
      ALTER TABLE \`inventory_tbl\`
        RENAME INDEX \`IDX_inventory_slug\` TO \`IDX_warehouse_material_slug\`,
        RENAME INDEX \`UQ_inventory\` TO \`UQ_warehouse_material\`,
        RENAME INDEX \`IDX_inventory_material\` TO \`IDX_warehouse_material_material\`;
    `);
    await queryRunner.query(`
      ALTER TABLE \`inventory_tbl\`
        ADD CONSTRAINT \`FK_warehouse_material_warehouse\`
          FOREIGN KEY (\`warehouse_id_column\`) REFERENCES \`warehouse_tbl\` (\`id_column\`)
          ON DELETE CASCADE,
        ADD CONSTRAINT \`FK_warehouse_material_material\`
          FOREIGN KEY (\`material_id_column\`) REFERENCES \`material_tbl\` (\`id_column\`)
          ON DELETE RESTRICT;
    `);

    await queryRunner.query(`RENAME TABLE \`inventory_tbl\` TO \`warehouse_material_tbl\`;`);
  }
}
