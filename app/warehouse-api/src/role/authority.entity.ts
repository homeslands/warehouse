import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { Base } from 'src/app/base.entity';
import { AuthorityGroup } from './authority-group.entity';
import { Permission } from './permission.entity';

@Entity('authority_tbl')
export class Authority extends Base {
  @Column({ name: 'name_column' })
  name: string;

  @ManyToOne(() => AuthorityGroup, (authorityGroup) => authorityGroup.authorities, { eager: true })
  @JoinColumn({ name: 'authority_group_id_column' })
  authorityGroup: AuthorityGroup;

  @OneToMany(() => Permission, (permission) => permission.authority)
  permissions: Permission[];
}
