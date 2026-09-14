import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { VersionedBase } from 'src/app/versioned.entity';
import { MaterialType } from 'src/material-type/material-type.entity';

@Entity('material_tbl')
export class Material extends VersionedBase {
  @AutoMap()
  @Column({ name: 'code_column', unique: true })
  code: string;

  // Cố ý KHÔNG unique: 2 loại vật tư khác nhau được phép trùng tên, `code` mới là khoá nghiệp vụ.
  @AutoMap()
  @Column({ name: 'name_column' })
  name: string;

  @ManyToOne(() => MaterialType, { nullable: false })
  @JoinColumn({ name: 'type_id_column' })
  type: MaterialType;

  /** Ngưỡng MẶC ĐỊNH chung mọi kho — từng kho override được qua `WarehouseMaterial`. */
  @AutoMap()
  @Column({ name: 'minimum_inventory_column', type: 'int', default: 0 })
  minimumInventory: number;

  @AutoMap()
  @Column({ name: 'maximum_inventory_column', type: 'int', default: 0 })
  maximumInventory: number;
}
