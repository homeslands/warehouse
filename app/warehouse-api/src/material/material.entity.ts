import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { VersionedBase } from 'src/app/versioned.entity';
import { MaterialType } from 'src/material-type/material-type.entity';
import { Unit } from 'src/unit/unit.entity';
import { MaterialUnit } from './material-unit.entity';

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

  /**
   * Đơn vị CƠ SỞ của vật tư — mốc quy đổi cho mọi đơn vị khác trong `unitsCanHave`
   * (`MaterialUnit.conversionRate` đếm theo đơn vị này).
   *
   * `nullable: true` vì cột được thêm sau (migration `1783728000020`) lên bảng đã có dữ liệu; FK
   * KHÔNG unique — nhiều vật tư được phép dùng chung 1 đơn vị cơ sở. Ràng buộc "unique" của nghiệp
   * vụ nằm ở tầng service: mỗi vật tư đúng 1 base unit, và base unit đó không được đồng thời là
   * đơn vị quy đổi của chính nó (`MATERIAL_BASE_UNIT_IS_CONVERSION_UNIT`).
   */
  @ManyToOne(() => Unit, { nullable: true })
  @JoinColumn({ name: 'base_unit_id_column' })
  baseUnit?: Unit;

  /** Ngưỡng MẶC ĐỊNH chung mọi kho — từng kho override được qua `WarehouseMaterial`. */
  @AutoMap()
  @Column({ name: 'minimum_inventory_column', type: 'int', default: 0 })
  minimumInventory: number;

  @AutoMap()
  @Column({ name: 'maximum_inventory_column', type: 'int', default: 0 })
  maximumInventory: number;

  /**
   * Các đơn vị quy đổi mà vật tư này được phép dùng, kèm tỉ lệ quy đổi/quy cách đóng gói — xem
   * `MaterialUnit`. Trước đây là `@ManyToMany` thuần; từ khi bảng join có thêm cột
   * `conversion_rate`/`quantity` thì phải đi qua entity trung gian, `@ManyToMany` không đọc/ghi
   * được cột phụ.
   *
   * Chưa expose đường GHI qua API: `Create/UpdateMaterialRequestDto` không nhận danh sách unit —
   * hiện chỉ ghi được ở tầng DB/migration. Đường ĐỌC đã có: `GET /materials/:slug/conversion-units`
   * (liệt kê unit dùng được làm đơn vị quy đổi, đã loại `baseUnit` của chính vật tư này).
   */
  @OneToMany(() => MaterialUnit, (materialUnit) => materialUnit.material)
  unitsCanHave: MaterialUnit[];
}
