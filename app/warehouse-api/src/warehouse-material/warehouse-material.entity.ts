import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { Material } from 'src/material/material.entity';
import { decimalToNumber } from 'src/shared/utils/decimal.transformer';

/**
 * 1 row = 1 vật tư trong 1 kho. Kế thừa `Base` chứ KHÔNG `VersionedBase`: `quantity` là đại lượng
 * cộng/trừ nguyên tử (sau này do phiếu nhập/xuất ghi) — đúng trường hợp CLAUDE.md nói không dùng
 * optimistic locking. Ngưỡng override thì sửa qua endpoint riêng, không đụng `quantity`.
 */
@Entity('warehouse_material_tbl')
@Unique('UQ_warehouse_material', ['warehouse', 'material'])
export class WarehouseMaterial extends Base {
  @ManyToOne(() => Warehouse, { nullable: false })
  @JoinColumn({ name: 'warehouse_id_column' })
  warehouse: Warehouse;

  @ManyToOne(() => Material, { nullable: false })
  @JoinColumn({ name: 'material_id_column' })
  material: Material;

  /**
   * Tồn thực tế của vật tư này TRONG KHO NÀY, luôn `>= 0` và luôn tính theo ĐƠN VỊ CƠ SỞ của vật tư
   * (`Material.baseUnit`) — phiếu ghi đơn vị nào thì cũng quy về base trước khi cộng vào đây.
   *
   * `DECIMAL(18,6)` (migration `1783728000021`): nhập theo đơn vị nhỏ hơn base cho ra số lẻ, cột
   * `int` cũ làm tròn về 0 và mất hàng im lặng.
   */
  @AutoMap()
  @Column({
    name: 'quantity_column',
    type: 'decimal',
    precision: 18,
    scale: 6,
    default: 0,
    transformer: decimalToNumber,
  })
  quantity: number;

  /** `null` = dùng ngưỡng mặc định của `Material`. Override từng vế độc lập nhau. */
  @AutoMap()
  @Column({
    name: 'minimum_inventory_column',
    type: 'decimal',
    precision: 18,
    scale: 6,
    nullable: true,
    transformer: decimalToNumber,
  })
  minimumInventory?: number | null;

  @AutoMap()
  @Column({
    name: 'maximum_inventory_column',
    type: 'decimal',
    precision: 18,
    scale: 6,
    nullable: true,
    transformer: decimalToNumber,
  })
  maximumInventory?: number | null;
}
