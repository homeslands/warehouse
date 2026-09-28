import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lịch sử gắn/gỡ kho của cửa hàng (`src/store/store-warehouse-history.entity.ts`). Viết tay vì
 * `typeorm:g` không dùng được trên repo này (xem CLAUDE.md).
 *
 * FK tới `store_tbl` là CASCADE (lịch sử thuộc về cửa hàng — thực tế cửa hàng chỉ xoá mềm). FK tới
 * kho / cửa hàng liên quan / người thao tác là SET NULL: xoá cứng chúng không được làm mất dòng lịch
 * sử. Kho/cửa hàng chỉ xoá mềm nên row vẫn còn và lịch sử vẫn hiện đủ.
 */
export class CreateStoreWarehouseHistoryTable1783728000030 implements MigrationInterface {
  name = 'CreateStoreWarehouseHistoryTable1783728000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`store_warehouse_history_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`store_id_column\` VARCHAR(36) NOT NULL,
        \`action_column\` VARCHAR(16) NOT NULL,
        \`previous_warehouse_id_column\` VARCHAR(36) NULL,
        \`new_warehouse_id_column\` VARCHAR(36) NULL,
        \`related_store_id_column\` VARCHAR(36) NULL,
        \`restored_from_id_column\` VARCHAR(36) NULL,
        \`changed_by_id_column\` VARCHAR(36) NULL,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_store_warehouse_history_slug\` (\`slug_column\`),
        INDEX \`IDX_store_warehouse_history_store_created\` (\`store_id_column\`, \`created_at_column\`),
        PRIMARY KEY (\`id_column\`),
        CONSTRAINT \`FK_swh_store\` FOREIGN KEY (\`store_id_column\`)
          REFERENCES \`store_tbl\` (\`id_column\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_swh_previous_warehouse\` FOREIGN KEY (\`previous_warehouse_id_column\`)
          REFERENCES \`warehouse_tbl\` (\`id_column\`) ON DELETE SET NULL,
        CONSTRAINT \`FK_swh_new_warehouse\` FOREIGN KEY (\`new_warehouse_id_column\`)
          REFERENCES \`warehouse_tbl\` (\`id_column\`) ON DELETE SET NULL,
        CONSTRAINT \`FK_swh_related_store\` FOREIGN KEY (\`related_store_id_column\`)
          REFERENCES \`store_tbl\` (\`id_column\`) ON DELETE SET NULL,
        CONSTRAINT \`FK_swh_restored_from\` FOREIGN KEY (\`restored_from_id_column\`)
          REFERENCES \`store_warehouse_history_tbl\` (\`id_column\`) ON DELETE SET NULL,
        CONSTRAINT \`FK_swh_changed_by\` FOREIGN KEY (\`changed_by_id_column\`)
          REFERENCES \`user_tbl\` (\`id_column\`) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`store_warehouse_history_tbl\`;`);
  }
}
