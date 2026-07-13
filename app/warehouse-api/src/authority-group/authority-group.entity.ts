import { Column, Entity, OneToMany } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Authority } from 'src/authority/authority.entity';

@Entity('authority_group_tbl')
export class AuthorityGroup extends Base {
  @AutoMap()
  @Column({ name: 'name_column' })
  name: string;

  @OneToMany(() => Authority, (authority) => authority.authorityGroup)
  authorities: Authority[];
}
