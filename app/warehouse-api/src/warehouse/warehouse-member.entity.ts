import { Entity, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Base } from 'src/app/base.entity';
import { User } from 'src/user/user.entity';
import { Warehouse } from './warehouse.entity';

/**
 * Bảng quan hệ N-N giữa `Warehouse` và `User`: 1 row = 1 user là thành viên của 1 kho.
 *
 * Người quản lý kho KHÔNG nằm ở đây — vẫn là `Warehouse.manager` (`manager_id_column` trên
 * `warehouse_tbl`). Bảng này chỉ chứa thành viên thường; có nên tự thêm manager vào làm member hay
 * không là quyết định của service, entity không ép.
 *
 * `UQ_warehouse_member` tính cả row đã xoá mềm (MySQL không có partial index): gỡ thành viên rồi
 * thêm lại phải `restore()` row cũ thay vì `insert` row mới, nếu không sẽ dính duplicate key.
 */
@Entity('warehouse_member_tbl')
@Unique('UQ_warehouse_member', ['warehouse', 'user'])
export class WarehouseMember extends Base {
  @ManyToOne(() => Warehouse, (warehouse) => warehouse.members, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'warehouse_id_column' })
  warehouse: Warehouse;

  @ManyToOne(() => User, (user) => user.warehouseMembers, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id_column' })
  user: User;
}
