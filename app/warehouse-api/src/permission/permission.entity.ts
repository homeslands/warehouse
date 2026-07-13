import { Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Base } from 'src/app/base.entity';
import { Authority } from 'src/authority/authority.entity';
import { Role } from 'src/role/role.entity';

@Entity('permission_tbl')
export class Permission extends Base {
  @ManyToOne(() => Role, (role) => role.permissions)
  @JoinColumn({ name: 'role_id_column' })
  role: Role;

  @ManyToOne(() => Authority, (authority) => authority.permissions, { eager: true })
  @JoinColumn({ name: 'authority_id_column' })
  authority: Authority;
}
