import { Entity, Column } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';

@Entity('material_type_tbl')
export class MaterialType extends Base {
  @AutoMap()
  @Column({ name: 'name_column', unique: true })
  name: string;

  @AutoMap()
  @Column({ name: 'code_column', unique: true })
  code: string;

  @AutoMap()
  @Column({ name: 'description_column', nullable: true })
  description?: string;
}
