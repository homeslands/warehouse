import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bảng thành viên kho (`src/warehouse/warehouse-member.entity.ts`) — quan hệ N-N `warehouse_tbl` <->
 * `user_tbl`. Viết tay vì `typeorm:g` không dùng được trên repo này (xem CLAUDE.md).
 *
 * Manager vẫn giữ ở `warehouse_tbl.manager_id_column`, không chuyển sang đây. Cả 2 FK đều CASCADE:
 * row thành viên không có nghĩa khi kho hoặc user bị xoá cứng (thực tế cả 2 chỉ xoá mềm).
 */
export class CreateWarehouseMemberTable1783728000034 implements MigrationInterface {
  name = 'CreateWarehouseMemberTable1783728000034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`warehouse_member_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`slug_column\` VARCHAR(255) NOT NULL,
        \`warehouse_id_column\` VARCHAR(36) NOT NULL,
        \`user_id_column\` VARCHAR(36) NOT NULL,
        \`created_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at_column\` DATETIME(6) NULL,
        \`created_by_column\` VARCHAR(255) NULL,
        UNIQUE INDEX \`IDX_warehouse_member_slug\` (\`slug_column\`),
        UNIQUE INDEX \`UQ_warehouse_member\` (\`warehouse_id_column\`, \`user_id_column\`),
        INDEX \`IDX_warehouse_member_user\` (\`user_id_column\`),
        PRIMARY KEY (\`id_column\`),
        CONSTRAINT \`FK_warehouse_member_warehouse\` FOREIGN KEY (\`warehouse_id_column\`)
          REFERENCES \`warehouse_tbl\` (\`id_column\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_warehouse_member_user\` FOREIGN KEY (\`user_id_column\`)
          REFERENCES \`user_tbl\` (\`id_column\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`warehouse_member_tbl\`;`);
  }
}
