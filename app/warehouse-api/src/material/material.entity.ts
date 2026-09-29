import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { VersionedBase } from 'src/app/versioned.entity';
import { MaterialType } from 'src/material-type/material-type.entity';
import { Unit } from 'src/unit/unit.entity';
import { MaterialUnit } from './material-unit.entity';
import { decimalToNumber } from 'src/shared/utils/decimal.transformer';

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
   * Dưới DB đây KHÔNG phải FK trỏ thẳng sang `unit_tbl` mà là 1 vế của FK TỔ HỢP
   * `(id, base_unit_id) -> material_unit_can_have_tbl (material_id, unit_id)` (migration
   * `1783728000022`): đơn vị cơ sở luôn là MỘT DÒNG trong bảng join với `conversionRate = 1`, cột
   * này chỉ trỏ xem dòng nào. TypeORM không khai được FK tổ hợp kiểu này nên ở đây vẫn khai quan hệ
   * 1 cột — ràng buộc thật nằm ở migration, đừng dựa vào metadata entity để suy ra nó.
   *
   * `nullable: true` vì cột thêm sau lên bảng đã có dữ liệu; InnoDB bỏ qua check FK tổ hợp khi 1 vế
   * là NULL nên vật tư cũ chưa khai đơn vị cơ sở vẫn hợp lệ.
   */
  @ManyToOne(() => Unit, { nullable: true })
  @JoinColumn({ name: 'base_unit_id_column' })
  baseUnit?: Unit;

  /**
   * Ngưỡng MẶC ĐỊNH chung mọi kho — từng kho override được qua `WarehouseMaterial`.
   *
   * `DECIMAL(18,6)` chứ không `int`: ngưỡng được so sánh trực tiếp với tồn kho, mà tồn kho sinh ra
   * từ phép quy đổi nên có phần lẻ (xem migration `1783728000021`).
   */
  @AutoMap()
  @Column({
    name: 'minimum_inventory_column',
    type: 'decimal',
    precision: 18,
    scale: 6,
    default: 0,
    transformer: decimalToNumber,
  })
  minimumInventory: number;

  @AutoMap()
  @Column({
    name: 'maximum_inventory_column',
    type: 'decimal',
    precision: 18,
    scale: 6,
    default: 0,
    transformer: decimalToNumber,
  })
  maximumInventory: number;

  /**
   * Các đơn vị quy đổi mà vật tư này được phép dùng, kèm tỉ lệ quy đổi — xem `MaterialUnit`.
   * Trước đây là `@ManyToMany` thuần; từ khi bảng join có thêm cột
   * `conversion_rate` thì phải đi qua entity trung gian, `@ManyToMany` không đọc/ghi được cột phụ.
   *
   * Chưa expose đường GHI qua API: `Create/UpdateMaterialRequestDto` không nhận danh sách unit —
   * hiện chỉ ghi được ở tầng DB/migration. Đường ĐỌC đã có: `GET /materials/:slug/conversion-units`
   * (liệt kê unit dùng được làm đơn vị quy đổi, đã loại `baseUnit` của chính vật tư này).
   */
  @OneToMany(() => MaterialUnit, (materialUnit) => materialUnit.material)
  unitsCanHave: MaterialUnit[];
}
