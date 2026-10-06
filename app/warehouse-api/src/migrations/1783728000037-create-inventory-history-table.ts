import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lịch sử thay đổi tồn kho (`src/inventory/inventory-history.entity.ts`), append-only. Viết tay vì
 * `typeorm:g` không dùng được trên repo này (xem CLAUDE.md).
 *
 * FK tới `inventory_tbl` là RESTRICT (khác `store_warehouse_history_tbl` dùng CASCADE): dòng tồn
 * chỉ xoá mềm, còn xoá cứng mà kéo theo lịch sử là mất dấu mọi lần nhập/xuất. FK tới người thao tác
 * là SET NULL: xoá cứng user không được làm mất dòng lịch sử.
 *
 * KHÔNG backfill: tồn đang có trước migration này không có dòng `ASSIGN` tương ứng — lịch sử bắt
 * đầu từ lần thay đổi đầu tiên sau khi migrate (`quantity_before_column` của dòng đó = tồn cũ).
 */
export class CreateInventoryHistoryTable1783728000037 implements MigrationInterface {
  name = 'CreateInventoryHistoryTable1783728000037';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`inventory_history_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`inventory_id_column\` VARCHAR(36) NOT NULL,
        \`action_column\` VARCHAR(16) NOT NULL,
        \`quantity_delta_column\` DECIMAL(18,6) NOT NULL DEFAULT 0,
        \`quantity_before_column\` DECIMAL(18,6) NOT NULL DEFAULT 0,
        \`quantity_after_column\` DECIMAL(18,6) NOT NULL DEFAULT 0,
        \`reserved_delta_column\` DECIMAL(18,6) NOT NULL DEFAULT 0,
        \`reserved_before_column\` DECIMAL(18,6) NOT NULL DEFAULT 0,
        \`reserved_after_column\` DECIMAL(18,6) NOT NULL DEFAULT 0,
        \`note_column\` VARCHAR(255) NULL,
        \`changed_by_id_column\` VARCHAR(36) NULL,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_inventory_history_slug\` (\`slug_column\`),
        INDEX \`IDX_inventory_history_inventory_created\` (\`inventory_id_column\`, \`created_at_column\`),
        PRIMARY KEY (\`id_column\`),
        CONSTRAINT \`FK_inventory_history_inventory\` FOREIGN KEY (\`inventory_id_column\`)
          REFERENCES \`inventory_tbl\` (\`id_column\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_inventory_history_changed_by\` FOREIGN KEY (\`changed_by_id_column\`)
          REFERENCES \`user_tbl\` (\`id_column\`) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`inventory_history_tbl\`;`);
  }
}
