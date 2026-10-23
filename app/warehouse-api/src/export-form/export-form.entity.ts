import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { VersionedBase } from 'src/app/versioned.entity';
import { User } from 'src/user/user.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { decimalToNumber } from 'src/shared/utils/decimal.transformer';
import { ExportFormStatus, ExportFormType } from './export-form.constants';
import { ExportFormItem } from './export-form-item.entity';

/**
 * Phiếu xuất kho: đầu phiếu + các dòng vật tư (`items`). Xác nhận phiếu trừ lô
 * (`MaterialBatchService.consume`, chỉ định hoặc FEFO) rồi trừ tồn của kho
 * (`InventoryService.issue`), cùng 1 transaction; phiếu nháp/huỷ không đụng tồn.
 *
 * `requesterName`/`approverName` là snapshot lúc ghi phiếu như phiếu nhập — FK vẫn giữ để tra ngược.
 */
@Entity('export_form_tbl')
export class ExportForm extends VersionedBase {
  @AutoMap()
  @Column({ name: 'code_column', unique: true })
  code: string;

  @AutoMap()
  @Column({ name: 'type_column', type: 'varchar', length: 16 })
  type: ExportFormType;

  @AutoMap()
  @Column({ name: 'status_column', type: 'varchar', length: 16, default: ExportFormStatus.Draft })
  status: ExportFormStatus;

  @AutoMap()
  @Column({ name: 'purchase_order_column', type: 'varchar', length: 64 })
  purchaseOrder: string;

  @AutoMap()
  @Column({ name: 'invoice_code_column', type: 'varchar', length: 64, nullable: true })
  invoiceCode?: string | null;

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

  /** Người/bộ phận nhận hàng — chuỗi tự do, không FK. */
  @AutoMap()
  @Column({ name: 'receiver_column' })
  receiver: string;

  /** Σ `items.amount`, do service tính lại mỗi lần `items` đổi — client không gửi. */
  @AutoMap()
  @Column({
    name: 'total_amount_column',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalToNumber,
  })
  totalAmount: number;

  @AutoMap()
  @Column({ name: 'note_column', type: 'text', nullable: true })
  note?: string;

  @AutoMap()
  @Column({ name: 'file_column', type: 'varchar', length: 1024, nullable: true })
  file?: string;

  @ManyToOne(() => Warehouse, { nullable: false })
  @JoinColumn({ name: 'warehouse_id_column' })
  warehouse: Warehouse;

  /** Ghi tường minh trong transaction của service; chỉ cascade xoá mềm/khôi phục. */
  @OneToMany(() => ExportFormItem, (item) => item.exportForm, {
    cascade: ['soft-remove', 'recover'],
  })
  items?: ExportFormItem[];
}
