import { Column, DeleteDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Bản ghi v1 trên các bảng legacy (W02 I-03a). Map ĐÚNG cột cần dùng, kể cả cột mới của migration
 * `1783728000049` (version/family/builtIn/fixedInvariant) mà entity legacy (`Role`, `Authority`…) không biết.
 * Không sửa entity legacy: route legacy giữ nguyên hành vi; insert legacy để DB tự điền DEFAULT (family NULL,
 * builtIn 0, version 1). `synchronize` luôn tắt nên 2 entity cùng bảng không đụng schema.
 * Chỉ Storage v1 dùng các entity này (Gateway không có DataSource).
 */
@Entity('role_tbl')
export class V1RoleRecord {
  @PrimaryColumn({ name: 'id_column', type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'name_column', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'description_column', type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ name: 'level_column', type: 'int' })
  level: number;

  @Column({ name: 'version_column', type: 'int' })
  version: number;

  @Column({ name: 'family_column', type: 'varchar', length: 16, nullable: true })
  family: string | null;

  @Column({
    name: 'built_in_column',
    type: 'tinyint',
    transformer: { to: (value: boolean) => (value ? 1 : 0), from: (value: number) => value === 1 },
  })
  builtIn: boolean;

  @Column({
    name: 'created_at_column',
    type: 'datetime',
    precision: 6,
    update: false,
    insert: false,
  })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at_column', type: 'datetime', precision: 6 })
  deletedAt: Date | null;
}

@Entity('authority_tbl')
export class V1AuthorityRecord {
  @PrimaryColumn({ name: 'id_column', type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'code_column', type: 'varchar', length: 255 })
  code: string;

  @Column({ name: 'name_column', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'authority_group_id_column', type: 'varchar', length: 36 })
  groupId: string;

  @Column({ name: 'version_column', type: 'int' })
  version: number;

  @Column({
    name: 'fixed_invariant_column',
    type: 'tinyint',
    transformer: { to: (value: boolean) => (value ? 1 : 0), from: (value: number) => value === 1 },
  })
  fixedInvariant: boolean;

  @Column({
    name: 'created_at_column',
    type: 'datetime',
    precision: 6,
    update: false,
    insert: false,
  })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at_column', type: 'datetime', precision: 6 })
  deletedAt: Date | null;
}

@Entity('authority_group_tbl')
export class V1AuthorityGroupRecord {
  @PrimaryColumn({ name: 'id_column', type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'name_column', type: 'varchar', length: 255 })
  name: string;

  @Column({
    name: 'created_at_column',
    type: 'datetime',
    precision: 6,
    update: false,
    insert: false,
  })
  createdAt: Date;

  @Column({
    name: 'updated_at_column',
    type: 'datetime',
    precision: 6,
    update: false,
    insert: false,
  })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at_column', type: 'datetime', precision: 6 })
  deletedAt: Date | null;
}

/** `permission_tbl` (role ↔ authority). `slug_column` NOT NULL UNIQUE của `Base` legacy ⇒ phải tự cấp. */
@Entity('permission_tbl')
export class V1PermissionRecord {
  @PrimaryColumn({ name: 'id_column', type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'slug_column', type: 'varchar', length: 255 })
  slug: string;

  @Column({ name: 'role_id_column', type: 'varchar', length: 36 })
  roleId: string;

  @Column({ name: 'authority_id_column', type: 'varchar', length: 36 })
  authorityId: string;

  @DeleteDateColumn({ name: 'deleted_at_column', type: 'datetime', precision: 6 })
  deletedAt: Date | null;
}

/** Phần `user_tbl` cần cho xác định actor: role + trạng thái. */
@Entity('user_tbl')
export class V1UserRoleRecord {
  @PrimaryColumn({ name: 'id_column', type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'role_id_column', type: 'varchar', length: 36 })
  roleId: string;

  @Column({
    name: 'is_active_column',
    type: 'tinyint',
    transformer: { to: (value: boolean) => (value ? 1 : 0), from: (value: number) => value === 1 },
  })
  isActive: boolean;

  @DeleteDateColumn({ name: 'deleted_at_column', type: 'datetime', precision: 6 })
  deletedAt: Date | null;
}
