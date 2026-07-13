import { Column, Entity, OneToMany } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Permission } from 'src/permission/permission.entity';

@Entity('role_tbl')
export class Role extends Base {
  @AutoMap()
  @Column({ name: 'name_column', nullable: false })
  name: string;

  @AutoMap()
  @Column({ name: 'description_column', nullable: true })
  description?: string;

  @OneToMany(() => Permission, (permission) => permission.role)
  permissions: Permission[];
}
