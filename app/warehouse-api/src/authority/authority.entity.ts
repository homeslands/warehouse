import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { AuthorityGroup } from 'src/authority-group/authority-group.entity';
import { Permission } from 'src/permission/permission.entity';

@Entity('authority_tbl')
export class Authority extends Base {
  @AutoMap()
  @Column({ name: 'name_column' })
  name: string;

  @AutoMap()
  @Column({ name: 'code_column', unique: true })
  code: string;

  @AutoMap(() => AuthorityGroup)
  @ManyToOne(() => AuthorityGroup, (authorityGroup) => authorityGroup.authorities, { eager: true })
  @JoinColumn({ name: 'authority_group_id_column' })
  authorityGroup: AuthorityGroup;

  @OneToMany(() => Permission, (permission) => permission.authority)
  permissions: Permission[];
}
