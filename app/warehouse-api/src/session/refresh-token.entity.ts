import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AuthSession } from './session.entity';

/**
 * Family refresh token (bảng logic R2 `refresh_token_families`): 1 family / 1 phiên (unique
 * `session_id_column`), sinh lúc login, giữ nguyên qua mọi lần rotation. Reuse token cũ ⇒ revoke cả family
 * và phiên (business-rules §20, data-and-migration §5a).
 */
@Entity('refresh_token_family_tbl')
export class RefreshTokenFamily {
  @PrimaryColumn({ name: 'id_column', type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'session_id_column', type: 'varchar', length: 36 })
  sessionId: string;

  @OneToOne(() => AuthSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id_column' })
  session?: AuthSession;

  @Column({ name: 'created_at_column', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at_column', type: 'datetime', precision: 6 })
  updatedAt: Date;

  @Column({ name: 'version_column', type: 'int', default: 1 })
  version: number;

  @Column({ name: 'revoked_at_column', type: 'datetime', precision: 6, nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoke_reason_column', type: 'varchar', length: 32, nullable: true })
  revokeReason: string | null;
}

/**
 * Hash refresh token (bảng logic R2 `refresh_token_hashes`). **Chỉ lưu SHA-256 hex** của token, không bao
 * giờ lưu plaintext (data-and-migration "refresh chỉ hash/token family, không plaintext").
 *
 * "Mỗi family chỉ 1 token hiện hành" được DB bảo đảm: `current_family_id_column` = id family khi token là
 * hiện hành, `NULL` khi đã dùng; unique index trên cột này (MySQL cho nhiều NULL) ⇒ tối đa 1 token hiện hành
 * mỗi family, kể cả khi 2 transaction rotate song song.
 */
@Entity('refresh_token_hash_tbl')
export class RefreshTokenHash {
  @PrimaryColumn({ name: 'id_column', type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'family_id_column', type: 'varchar', length: 36 })
  familyId: string;

  @ManyToOne(() => RefreshTokenFamily, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'family_id_column' })
  family?: RefreshTokenFamily;

  @Column({ name: 'token_hash_column', type: 'char', length: 64 })
  tokenHash: string;

  @Column({ name: 'current_family_id_column', type: 'varchar', length: 36, nullable: true })
  currentFamilyId: string | null;

  @Column({ name: 'created_at_column', type: 'datetime', precision: 6 })
  createdAt: Date;

  @Column({ name: 'expires_at_column', type: 'datetime', precision: 6 })
  expiresAt: Date;

  @Column({ name: 'used_at_column', type: 'datetime', precision: 6, nullable: true })
  usedAt: Date | null;
}
