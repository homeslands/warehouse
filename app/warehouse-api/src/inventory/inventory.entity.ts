import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Unique } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { Material } from 'src/material/material.entity';
import { decimalToNumber } from 'src/shared/utils/decimal.transformer';
import { InventoryHistory } from './inventory-history.entity';

/**
 * 1 row = 1 vật tư trong 1 kho (bảng `inventory_tbl`, trước migration `1783728000036` là
 * `warehouse_material_tbl`). Kế thừa `Base` chứ KHÔNG `VersionedBase`: chống ghi đè đồng thời lên
 * `quantity`/`reservedQuantity` bằng PESSIMISTIC lock (`SELECT ... FOR UPDATE` trong transaction,
 * xem `InventoryService.mutate`), không bằng cột version — client không phải gửi lại `version`.
 * Mọi thay đổi tồn đều ghi 1 dòng `InventoryHistory` trong cùng transaction.
 */
@Entity('inventory_tbl')
@Unique('UQ_inventory', ['warehouse', 'material'])
export class Inventory extends Base {
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

  /**
   * Lượng đã GIỮ CHỖ cho phiếu xuất chưa hoàn tất, cùng đơn vị cơ sở với `quantity`. Bất biến
   * `0 <= reservedQuantity <= quantity` do service gác (không có CHECK dưới DB): adjust không được
   * kéo `quantity` xuống dưới mức đã giữ, gỡ vật tư khỏi kho thì phải hết giữ chỗ trước.
   */
  @AutoMap()
  @Column({
    name: 'reserved_quantity_column',
    type: 'decimal',
    precision: 18,
    scale: 6,
    default: 0,
    transformer: decimalToNumber,
  })
  reservedQuantity: number;

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

  /** Append-only, mới nhất đọc qua `GET .../materials/:materialSlug/histories`. Không `cascade`. */
  @OneToMany(() => InventoryHistory, (history) => history.inventory)
  histories?: InventoryHistory[];
}
