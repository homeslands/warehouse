import { Column, Entity, OneToMany } from 'typeorm';
import { Base } from 'src/app/base.entity';
import { Authority } from './authority.entity';

@Entity('authority_group_tbl')
export class AuthorityGroup extends Base {
  @Column({ name: 'name_column' })
  name: string;

  @OneToMany(() => Authority, (authority) => authority.authorityGroup)
  authorities: Authority[];
}
