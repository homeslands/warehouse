import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { decimalToNumber } from 'src/shared/utils/decimal.transformer';
import { Material } from './material.entity';
import { Unit } from 'src/unit/unit.entity';

/**
 * Bảng join `material_unit_can_have_tbl` giờ MANG DỮ LIỆU (`conversion_rate`) nên
 * không còn khai được bằng `@ManyToMany` + `@JoinTable` — TypeORM chỉ ghi/đọc đúng 2 cột khoá của
 * bảng join, mọi cột phụ sẽ bị bỏ qua hoàn toàn. Vì vậy quan hệ N-N được tách thành entity trung
 * gian này (`Material.unitsCanHave` / `Unit.materialUnits` là 2 phía `@OneToMany`).
 *
 * KHÔNG kế thừa `Base`: bảng không có `id`/`slug`/soft-delete, PK là cặp
 * (`material_id_column`, `unit_id_column`) — đúng schema đã tạo ở migration `1783728000019`.
 */

@Entity('material_unit_can_have_tbl')
export class MaterialUnit {
  @PrimaryColumn({ name: 'material_id_column', type: 'varchar', length: 36 })
  materialId: string;

  @PrimaryColumn({ name: 'unit_id_column', type: 'varchar', length: 36 })
  unitId: string;

  @ManyToOne(() => Material, (material) => material.unitsCanHave, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'material_id_column' })
  material: Material;

  @ManyToOne(() => Unit, (unit) => unit.materialUnits, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unit_id_column' })
  unit: Unit;

  /**
   * Số ĐƠN VỊ CƠ SỞ trong 1 đơn vị này. VD base = KG, 1 BAO = 50 ⇒ 50.
   *
   * Dòng của CHÍNH đơn vị cơ sở (dòng mà `Material.baseUnit` trỏ tới) luôn có giá trị `1` —
   * `MaterialService` không cho sửa tỉ lệ của dòng đó.
   */
  @AutoMap()
  @Column({
    name: 'conversion_rate_column',
    type: 'decimal',
    precision: 18,
    scale: 6,
    default: 1,
    transformer: decimalToNumber,
  })
  conversionRate: number;
}
