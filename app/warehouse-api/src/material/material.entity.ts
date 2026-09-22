import { Entity, Column, ManyToOne, JoinColumn, ManyToMany, JoinTable } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { VersionedBase } from 'src/app/versioned.entity';
import { MaterialType } from 'src/material-type/material-type.entity';
import { Unit } from 'src/unit/unit.entity';

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

  /**
   * Các đơn vị tính mà vật tư này được phép dùng. Owning side (`@JoinTable`) đặt ở đây vì quan hệ
   * đọc theo chiều "material có thể có unit nào"; phía nghịch là `Unit.materials`.
   *
   * Chưa expose qua API: `Create/UpdateMaterialRequestDto` không nhận danh sách unit, mapper cũng
   * không map field này — bảng join hiện chỉ ghi được ở tầng DB/migration.
   */
  @ManyToMany(() => Unit, (unit) => unit.materials)
  @JoinTable({
    name: 'material_unit_can_have_tbl',
    joinColumn: { name: 'material_id_column', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'unit_id_column', referencedColumnName: 'id' },
  })
  unitsCanHave: Unit[];
}
