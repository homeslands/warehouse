import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { Material } from 'src/material/material.entity';

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

  /** Tồn thực tế của vật tư này TRONG KHO NÀY. Luôn `>= 0`. */
  @AutoMap()
  @Column({ name: 'quantity_column', type: 'int', default: 0 })
  quantity: number;

  /** `null` = dùng ngưỡng mặc định của `Material`. Override từng vế độc lập nhau. */
  @AutoMap()
  @Column({ name: 'minimum_inventory_column', type: 'int', nullable: true })
  minimumInventory?: number | null;

  @AutoMap()
  @Column({ name: 'maximum_inventory_column', type: 'int', nullable: true })
  maximumInventory?: number | null;
}
