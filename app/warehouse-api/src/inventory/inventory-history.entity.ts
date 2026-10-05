import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { User } from 'src/user/user.entity';
import { decimalToNumber } from 'src/shared/utils/decimal.transformer';
import { Inventory } from './inventory.entity';
import { InventoryHistoryAction } from './inventory.constants';

const decimalColumn = (name: string) =>
  Column({
    name,
    type: 'decimal',
    precision: 18,
    scale: 6,
    default: 0,
    transformer: decimalToNumber,
  });

/**
 * 1 dòng = 1 lần `Inventory.quantity`/`reservedQuantity` đổi giá trị. Chỉ ghi thêm (append-only),
 * không sửa/xoá qua API. Ghi CÙNG transaction với thay đổi tồn và sau khi đã khoá dòng tồn bằng
 * `pessimistic_write`, nên `*Before`/`*After` là snapshot chính xác, không bị lệnh khác chen giữa.
 *
 * Lưu cả delta lẫn before/after (thừa 1 cột) để đọc lịch sử không phải cộng dồn, và để phát hiện
 * được chỗ tồn bị sửa thẳng dưới DB (`after` dòng trước ≠ `before` dòng sau).
 */
@Entity('inventory_history_tbl')
export class InventoryHistory extends Base {
  @ManyToOne(() => Inventory, (inventory) => inventory.histories, { nullable: false })
  @JoinColumn({ name: 'inventory_id_column' })
  inventory: Inventory;

  @AutoMap()
  @Column({ name: 'action_column', type: 'varchar', length: 16 })
  action: InventoryHistoryAction;

  @AutoMap()
  @decimalColumn('quantity_delta_column')
  quantityDelta: number;

  @AutoMap()
  @decimalColumn('quantity_before_column')
  quantityBefore: number;

  @AutoMap()
  @decimalColumn('quantity_after_column')
  quantityAfter: number;

  @AutoMap()
  @decimalColumn('reserved_delta_column')
  reservedDelta: number;

  @AutoMap()
  @decimalColumn('reserved_before_column')
  reservedBefore: number;

  @AutoMap()
  @decimalColumn('reserved_after_column')
  reservedAfter: number;

  @AutoMap()
  @Column({ name: 'note_column', type: 'varchar', length: 255, nullable: true })
  note?: string | null;

  /** Người thao tác (`CurrentUserDto.userId`). */
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'changed_by_id_column' })
  changedBy?: User | null;
}
