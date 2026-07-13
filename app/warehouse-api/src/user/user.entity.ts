import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Role } from 'src/role/role.entity';

@Entity('user_tbl')
export class User extends Base {
  @AutoMap()
  @Column({ name: 'phonenumber_column', unique: true })
  phonenumber: string;

  @Column({ name: 'password_column' })
  password: string;

  @AutoMap()
  @Column({ name: 'is_active_column', default: true })
  isActive: boolean;

  @ManyToOne(() => Role, { eager: true })
  @JoinColumn({ name: 'role_id_column' })
  role: Role;
}
