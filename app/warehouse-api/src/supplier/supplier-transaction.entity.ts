import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Material } from 'src/material/material.entity';
import { User } from 'src/user/user.entity';
import { decimalToNumber } from 'src/shared/utils/decimal.transformer';
import { Supplier } from './supplier.entity';
import { SupplierTransactionType } from './supplier.constants';

/**
 * 1 dòng = 1 giao dịch với nhà cung cấp (mua / trả hàng / thanh toán). Chỉ ghi thêm (append-only),
 * không sửa/xoá qua API — sai thì ghi 1 giao dịch bù.
 *
 * Mọi quan hệ phải đọc kèm `withDeleted`: nhà cung cấp/vật tư bị xoá mềm sau đó vẫn phải hiện đúng
 * trong lịch sử.
 */
@Entity('supplier_transaction_tbl')
export class SupplierTransaction extends Base {
  @ManyToOne(() => Supplier, { nullable: false })
  @JoinColumn({ name: 'supplier_id_column' })
  supplier: Supplier;

  @AutoMap()
  @Column({ name: 'type_column', type: 'varchar', length: 16 })
  type: SupplierTransactionType;

  /** Chỉ có với `PURCHASE`/`RETURN`. */
  @ManyToOne(() => Material, { nullable: true })
  @JoinColumn({ name: 'material_id_column' })
  material?: Material | null;

  /** Số lượng theo ĐƠN VỊ CƠ SỞ của vật tư. Chỉ có với `PURCHASE`/`RETURN`. */
  @AutoMap()
  @Column({
    name: 'quantity_column',
    type: 'decimal',
    precision: 18,
    scale: 6,
    nullable: true,
    transformer: decimalToNumber,
  })
  quantity?: number | null;

  /** Đơn giá trên 1 đơn vị cơ sở, snapshot tại thời điểm giao dịch. Chỉ có với `PURCHASE`/`RETURN`. */
  @AutoMap()
  @Column({
    name: 'unit_price_column',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: decimalToNumber,
  })
  unitPrice?: number | null;

  /** Tổng tiền, luôn dương. `PURCHASE`/`RETURN`: server tính = quantity × unitPrice. */
  @AutoMap()
  @Column({
    name: 'amount_column',
    type: 'decimal',
    precision: 18,
    scale: 2,
    transformer: decimalToNumber,
  })
  amount: number;

  /** Thời điểm giao dịch thực tế (có thể khác `createdAt` nếu nhập bù). */
  @AutoMap()
  @Column({ name: 'transaction_date_column', type: 'datetime', precision: 6 })
  transactionDate: Date;

  @AutoMap()
  @Column({ name: 'note_column', type: 'text', nullable: true })
  note?: string;

  /** Người ghi giao dịch (`CurrentUserDto.userId`). */
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'performed_by_id_column' })
  performedBy?: User | null;
}
