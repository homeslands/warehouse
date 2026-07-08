import { Entity, Column } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';

@Entity('example_tbl')
export class Example extends Base {
  @AutoMap()
  @Column({ name: 'name_column' })
  name: string;

  @AutoMap()
  @Column({ name: 'description_column', nullable: true })
  description?: string;
}
