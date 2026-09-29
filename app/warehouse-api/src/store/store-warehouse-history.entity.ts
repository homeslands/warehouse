import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { User } from 'src/user/user.entity';
import { Store } from './store.entity';
import { StoreWarehouseHistoryAction } from './store.constants';

/**
 * 1 dòng = 1 lần slot `Store.warehouse` của 1 cửa hàng đổi giá trị. Chỉ ghi thêm (append-only), không
 * sửa/xoá qua API — là nguồn để `POST /stores/:slug/warehouse-histories/:historySlug/restore` đưa
 * cửa hàng về `previousWarehouse`.
 *
 * Mọi quan hệ tới kho/cửa hàng đều phải đọc kèm `withDeleted`: kho/cửa hàng bị xoá mềm sau đó vẫn
 * phải hiện đúng trong lịch sử, và restore phải thấy được kho cũ để báo `WAREHOUSE_NOT_FOUND` chứ
 * không hiểu nhầm thành "trước đó không có kho".
 */
@Entity('store_warehouse_history_tbl')
export class StoreWarehouseHistory extends Base {
  @ManyToOne(() => Store, { nullable: false })
  @JoinColumn({ name: 'store_id_column' })
  store: Store;

  @AutoMap()
  @Column({ name: 'action_column', type: 'varchar', length: 16 })
  action: StoreWarehouseHistoryAction;

  /** Kho cửa hàng giữ TRƯỚC thay đổi; `null` = trước đó chưa gắn kho. Là đích của restore. */
  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'previous_warehouse_id_column' })
  previousWarehouse?: Warehouse | null;

  /** Kho SAU thay đổi; `null` = gỡ kho. */
  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'new_warehouse_id_column' })
  newWarehouse?: Warehouse | null;

  /**
   * Cửa hàng còn lại trong 1 lần chuyển kho: với `RELEASED` là cửa hàng đã lấy kho đi; với
   * `ASSIGN`/`RESTORE` là cửa hàng bị lấy kho (nếu có).
   */
  @ManyToOne(() => Store, { nullable: true })
  @JoinColumn({ name: 'related_store_id_column' })
  relatedStore?: Store | null;

  /** Dòng lịch sử được khôi phục — chỉ có với `RESTORE`. */
  @ManyToOne(() => StoreWarehouseHistory, { nullable: true })
  @JoinColumn({ name: 'restored_from_id_column' })
  restoredFrom?: StoreWarehouseHistory | null;

  /** Người thao tác (`CurrentUserDto.userId`). */
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'changed_by_id_column' })
  changedBy?: User | null;
}
