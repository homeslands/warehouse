import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from 'src/user/user.entity';

/**
 * Phiên đăng nhập v1 (bảng logic R2 `sessions`, data-and-migration §Session; migration
 * `1783728000048`; tên bảng `auth_session_tbl` vì `session_tbl` thuộc express-mysql-session legacy). Không kế thừa `Base` (không có slug/created_by: phiên không có định danh public
 * ngoài UUID). Mọi mốc thời gian do service ghi từ đồng hồ inject (UTC), không dùng DEFAULT của DB.
 *
 * Trạng thái tách riêng (R2 "revoked / idle / token expiry tách riêng"):
 * - `revokedAt`: thu hồi (logout, logout-all, revoke, reuse, đổi mật khẩu) — vĩnh viễn;
 * - `lockedAt`: khoá bằng `POST /auth/lock` — vĩnh viễn (contract không có unlock);
 * - `idleExpiresAt`: hết hạn do không hoạt động; chỉ `recordInteractiveActivity` đẩy lùi;
 * - `expiresAt`: tuổi tối đa tuyệt đối (≤ 7 ngày từ login).
 * `ipAddress` đầy đủ chỉ lưu ở đây (storage hạn chế); API chỉ trả `ipMasked`.
 */
@Entity('auth_session_tbl')
export class AuthSession {
  @PrimaryColumn({ name: 'id_column', type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'user_id_column', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id_column' })
  user?: User;

  @Column({ name: 'created_at_column', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at_column', type: 'datetime', precision: 6 })
  updatedAt: Date;

  @Column({ name: 'version_column', type: 'int', default: 1 })
  version: number;

  @Column({ name: 'last_interactive_at_column', type: 'datetime', precision: 6 })
  lastInteractiveAt: Date;

  @Column({ name: 'idle_expires_at_column', type: 'datetime', precision: 6 })
  idleExpiresAt: Date;

  @Column({ name: 'expires_at_column', type: 'datetime', precision: 6 })
  expiresAt: Date;

  @Column({ name: 'locked_at_column', type: 'datetime', precision: 6, nullable: true })
  lockedAt: Date | null;

  @Column({ name: 'revoked_at_column', type: 'datetime', precision: 6, nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoke_reason_column', type: 'varchar', length: 32, nullable: true })
  revokeReason: string | null;

  @Column({ name: 'ip_address_column', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent_column', type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;
}
