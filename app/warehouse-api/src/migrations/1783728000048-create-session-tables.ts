import { MigrationInterface, QueryRunner } from 'typeorm';

interface ColumnCharset {
  CHARACTER_SET_NAME: string;
  COLLATION_NAME: string;
}

/** Tên charset/collation chỉ gồm chữ thường, số, `_` — chặn chèn SQL qua metadata trước khi nội suy DDL. */
const CHARSET_NAME = /^[a-z0-9_]+$/;

/**
 * W02 I-02 — phase **expand** cho phiên đăng nhập R2 (data-and-migration §Session, §65-74; #196 mục 5, 5b):
 * tạo 3 bảng MỚI `auth_session_tbl`, `refresh_token_family_tbl`, `refresh_token_hash_tbl`. Không đổi bảng cũ,
 * không backfill (không có dữ liệu cũ tương ứng: refresh legacy là JWT không lưu DB), API v1 chưa bật.
 *
 * - Chỉ lưu SHA-256 hex của refresh token (`token_hash_column`, unique, ascii_bin), không plaintext.
 * - Tên `auth_session_tbl` (không phải `session_tbl`): `session_tbl` đã là bảng của `express-mysql-session`
 *   (`src/config/session.config.ts`, legacy) ở mọi môi trường.
 * - `auth_session_tbl.user_id_column` FK `user_tbl` — kiểu/charset/collation lấy từ metadata cột cha lúc chạy
 *   (R2: "FK mới phải cùng type/length/charset/collation với PK cha… kiểm metadata cột cha").
 * - 1 family / phiên (unique `session_id_column`); tối đa 1 token hiện hành / family (unique
 *   `current_family_id_column`, NULL khi đã dùng).
 * - FK CASCADE: phiên/family/hash không có nghĩa khi user/phiên cha bị xoá cứng (user thực tế chỉ xoá mềm).
 *
 * **down** = DROP 3 bảng. Chỉ hợp lệ trước khi bật capability v1 (#196 mục 5b bước 6): khi đã có dữ liệu
 * phiên v1 thật thì KHÔNG chạy down — dừng ghi capability và forward-fix. Revert DB có sẵn cần quyền riêng.
 */
export class CreateSessionTables1783728000048 implements MigrationInterface {
  name = 'CreateSessionTables1783728000048';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const parent: ColumnCharset[] = await queryRunner.query(
      `SELECT CHARACTER_SET_NAME, COLLATION_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_tbl' AND COLUMN_NAME = 'id_column'`,
    );
    if (parent.length !== 1) throw new Error('user_tbl.id_column not found');
    const { CHARACTER_SET_NAME: charset, COLLATION_NAME: collation } = parent[0];
    if (!CHARSET_NAME.test(charset) || !CHARSET_NAME.test(collation))
      throw new Error('unexpected charset/collation metadata for user_tbl.id_column');

    await queryRunner.query(`
      CREATE TABLE \`auth_session_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`user_id_column\` VARCHAR(36) CHARACTER SET ${charset} COLLATE ${collation} NOT NULL,
        \`created_at_column\` DATETIME(6) NOT NULL,
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`version_column\` INT NOT NULL DEFAULT 1,
        \`last_interactive_at_column\` DATETIME(6) NOT NULL,
        \`idle_expires_at_column\` DATETIME(6) NOT NULL,
        \`expires_at_column\` DATETIME(6) NOT NULL,
        \`locked_at_column\` DATETIME(6) NULL,
        \`revoked_at_column\` DATETIME(6) NULL,
        \`revoke_reason_column\` VARCHAR(32) NULL,
        \`ip_address_column\` VARCHAR(45) NULL,
        \`user_agent_column\` VARCHAR(500) NULL,
        PRIMARY KEY (\`id_column\`),
        INDEX \`IDX_auth_session_user_revoked\` (\`user_id_column\`, \`revoked_at_column\`),
        CONSTRAINT \`FK_session_user\` FOREIGN KEY (\`user_id_column\`)
          REFERENCES \`user_tbl\` (\`id_column\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE \`refresh_token_family_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`session_id_column\` VARCHAR(36) NOT NULL,
        \`created_at_column\` DATETIME(6) NOT NULL,
        \`updated_at_column\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`version_column\` INT NOT NULL DEFAULT 1,
        \`revoked_at_column\` DATETIME(6) NULL,
        \`revoke_reason_column\` VARCHAR(32) NULL,
        PRIMARY KEY (\`id_column\`),
        UNIQUE INDEX \`UQ_refresh_token_family_session\` (\`session_id_column\`),
        CONSTRAINT \`FK_refresh_token_family_session\` FOREIGN KEY (\`session_id_column\`)
          REFERENCES \`auth_session_tbl\` (\`id_column\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE \`refresh_token_hash_tbl\` (
        \`id_column\` VARCHAR(36) NOT NULL,
        \`family_id_column\` VARCHAR(36) NOT NULL,
        \`token_hash_column\` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        \`current_family_id_column\` VARCHAR(36) NULL,
        \`created_at_column\` DATETIME(6) NOT NULL,
        \`expires_at_column\` DATETIME(6) NOT NULL,
        \`used_at_column\` DATETIME(6) NULL,
        PRIMARY KEY (\`id_column\`),
        UNIQUE INDEX \`UQ_refresh_token_hash\` (\`token_hash_column\`),
        UNIQUE INDEX \`UQ_refresh_token_current_per_family\` (\`current_family_id_column\`),
        INDEX \`IDX_refresh_token_hash_family\` (\`family_id_column\`),
        CONSTRAINT \`FK_refresh_token_hash_family\` FOREIGN KEY (\`family_id_column\`)
          REFERENCES \`refresh_token_family_tbl\` (\`id_column\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_refresh_token_hash_current_family\` FOREIGN KEY (\`current_family_id_column\`)
          REFERENCES \`refresh_token_family_tbl\` (\`id_column\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`refresh_token_hash_tbl\`;`);
    await queryRunner.query(`DROP TABLE \`refresh_token_family_tbl\`;`);
    await queryRunner.query(`DROP TABLE \`auth_session_tbl\`;`);
  }
}
