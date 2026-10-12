import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { VersionedBase } from 'src/app/versioned.entity';
import { Supplier } from 'src/supplier/supplier.entity';
import { User } from 'src/user/user.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { decimalToNumber } from 'src/shared/utils/decimal.transformer';
import { ImportFormStatus } from './import-form.constants';

/**
 * Phiếu nhập kho (mới có phần đầu phiếu, chưa có dòng vật tư — nên xác nhận phiếu CHƯA cộng tồn).
 *
 * Các cột `supplier*`/`requesterName`/`approverName` là **snapshot** lúc ghi phiếu, không phải dữ
 * liệu join: nhà cung cấp/user sửa tên, địa chỉ, MST bất cứ lúc nào, đọc qua FK là viết lại chứng từ
 * cũ. FK vẫn giữ để tra ngược "phiếu nào của nhà cung cấp/người này".
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

  @ManyToOne(() => Supplier, { nullable: false })
  @JoinColumn({ name: 'supplier_id_column' })
  supplier: Supplier;

  @AutoMap()
  @Column({ name: 'supplier_name_column' })
  supplierName: string;

  @AutoMap()
  @Column({ name: 'supplier_code_column' })
  supplierCode: string;

  @AutoMap()
  @Column({ name: 'supplier_slug_column' })
  supplierSlug: string;

  @AutoMap()
  @Column({ name: 'supplier_tax_code_column', type: 'varchar', nullable: true })
  supplierTaxCode?: string | null;

  @AutoMap()
  @Column({ name: 'supplier_address_column', type: 'varchar', nullable: true })
  supplierAddress?: string | null;

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
}
