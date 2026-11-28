import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { VersionedBase } from 'src/app/versioned.entity';
import { User } from 'src/user/user.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { decimalToNumber } from 'src/shared/utils/decimal.transformer';
import { ImportFormStatus } from './import-form.constants';
import { Item } from 'src/item/item.entity';

/**
 * Phiếu nhập kho: phần đầu phiếu + các đơn vị hàng (`items`, entity `Item` — 1 item = 1 dòng). Xác
 * nhận phiếu cộng `baseQuantity` của từng item vào tồn của kho (`InventoryService.receive`) và chuyển
 * item `PENDING` ⇒ `IN_STOCK`; huỷ ⇒ `VOID`; phiếu nháp không đụng tồn.
 *
 * Các cột `requesterName`/`approverName` là **snapshot** lúc ghi phiếu, không phải dữ liệu join: user
 * sửa tên bất cứ lúc nào, đọc qua FK là viết lại chứng từ cũ. FK vẫn giữ để tra ngược "phiếu nào
 * của người này". Phiếu nhập không gắn nhà cung cấp.
 */
@Entity('import_form_tbl')
export class ImportForm extends VersionedBase {
  @AutoMap()
  @Column({ name: 'code_column', unique: true })
  code: string;

  @AutoMap()
  @Column({ name: 'purchase_order_column', nullable: true })
  purchaseOrder?: string;

  @AutoMap()
  @Column({ name: 'invoice_code_column' })
  invoiceCode: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'requester_id_column' })
  requester?: User;

  @AutoMap()
  @Column({ name: 'requester_name_column' })
  requesterName: string;

  /** `null` khi phiếu còn `DRAFT`; gán bằng người xác nhận/huỷ phiếu. */
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approver_id_column' })
  approver?: User | null;

  @AutoMap()
  @Column({ name: 'approver_name_column', type: 'varchar', nullable: true })
  approverName?: string | null;

  // `type: 'date'`: TypeORM trả về chuỗi `YYYY-MM-DD` (không phải `Date`), không dính múi giờ.
  @AutoMap()
  @Column({ name: 'date_column', type: 'date' })
  date: string;

  @AutoMap()
  @Column({
    name: 'total_column',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalToNumber,
  })
  total: number;

  @AutoMap()
  @Column({ name: 'file_column', type: 'varchar', length: 1024, nullable: true })
  file?: string;

  @AutoMap()
  @Column({ name: 'note_column', type: 'text', nullable: true })
  note?: string;

  @AutoMap()
  @Column({ name: 'status_column', type: 'varchar', length: 16, default: ImportFormStatus.Draft })
  status: ImportFormStatus;

  @ManyToOne(() => Warehouse, { nullable: false })
  @JoinColumn({ name: 'warehouse_id_column' })
  warehouse: Warehouse;

  /**
   * Đơn vị hàng của phiếu (FK `item_tbl.import_form_id_column`). Service ghi/xoá tường minh trong
   * transaction khoá đầu phiếu, không cascade: xoá phiếu nháp xoá cứng item `PENDING` trước rồi mới
   * xoá mềm phiếu. `total` = Σ `items.amount`, do service tính lại mỗi lần thêm/gỡ — client
   * không gửi `total`.
   */
  @OneToMany(() => Item, (item) => item.importForm)
  items?: Item[];
}
