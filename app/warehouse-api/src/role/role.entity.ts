import { Column, Entity, OneToMany } from 'typeorm';
import { Base } from 'src/app/base.entity';
import { RoleEnum } from './role.enum';
import { Permission } from './permission.entity';

@Entity('role_tbl')
export class Role extends Base {
  @Column({ name: 'name_column', type: 'enum', enum: RoleEnum })
  name: RoleEnum;

  @Column({ name: 'description_column', nullable: true })
  description?: string;

  @OneToMany(() => Permission, (permission) => permission.role)
  permissions: Permission[];
}
