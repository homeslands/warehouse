import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Role } from 'src/role/role.entity';

@Entity('user_tbl')
export class User extends Base {
  @AutoMap()
  @Column({ name: 'phonenumber_column', unique: true })
  phonenumber: string;

  @AutoMap()
  @Column({ name: 'first_name_column' })
  firstName: string;

  @AutoMap()
  @Column({ name: 'last_name_column' })
  lastName: string;

  // `type: 'date'`: TypeORM trả về chuỗi `YYYY-MM-DD` (không phải `Date`), không dính múi giờ.
  @AutoMap()
  @Column({ name: 'dob_column', type: 'date', nullable: true })
  dob?: string;

  @AutoMap()
  @Column({ name: 'email_column', nullable: true })
  email?: string;

  @AutoMap()
  @Column({ name: 'address_column', nullable: true })
  address?: string;

  @Column({ name: 'password_column' })
  password: string;

  @AutoMap()
  @Column({ name: 'is_active_column', default: true })
  isActive: boolean;

  @ManyToOne(() => Role, { eager: true })
  @JoinColumn({ name: 'role_id_column' })
  role: Role;
}
