import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Material } from 'src/material/material.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { ImportFormItem } from 'src/import-form/import-form-item.entity';
import { decimalToNumber } from 'src/shared/utils/decimal.transformer';
import { MaterialBatchStatus } from './material-batch.constants';

/**
 * 1 lô hàng = 1 dòng phiếu nhập đã xác nhận (`ImportFormService.decide` → `createFromImportItems`).
 * KHÔNG có API tạo/sửa/xoá: lô chỉ sinh ra khi xác nhận phiếu nhập; phiếu xuất gửi duyệt giữ chỗ
 * (`reservedQuantity`), xác nhận thì trừ `remainingQuantity` (`MaterialBatchService`).
 *
 * Kế thừa `Base` chứ không `VersionedBase`: như `Inventory`, chống ghi đè đồng thời bằng
 * pessimistic lock trong transaction, client không gửi `version`.
 *
 * Số lượng luôn theo ĐƠN VỊ CƠ SỞ của vật tư (cùng đơn vị với `Inventory.quantity`).
 * `warehouse` thừa so với `importFormItem.importForm.warehouse` nhưng cố ý giữ: FEFO luôn tra theo
 * (kho, vật tư), không phải join 3 bảng mỗi lần xuất.
 */
@Entity('material_batch_tbl')
@Index('IDX_material_batch_fefo', ['warehouse', 'material', 'status', 'expiryDate'])
export class MaterialBatch extends Base {
  @ManyToOne(() => Material, { nullable: false })
  @JoinColumn({ name: 'material_id_column' })
  material: Material;

  @ManyToOne(() => Warehouse, { nullable: false })
  @JoinColumn({ name: 'warehouse_id_column' })
  warehouse: Warehouse;

  @ManyToOne(() => ImportFormItem, (item) => item.batches, { nullable: false })
  @JoinColumn({ name: 'import_form_item_id_column' })
  importFormItem: ImportFormItem;

  /** Ngày nhập (`YYYY-MM-DD`) = `date` của phiếu nhập. */
  @AutoMap()
  @Column({ name: 'entry_date_column', type: 'date' })
  entryDate: string;

  /** Hạn dùng (`YYYY-MM-DD`), `null` = không có hạn — FEFO xếp các lô này sau cùng. */
  @AutoMap()
  @Column({ name: 'expiry_date_column', type: 'date', nullable: true })
  expiryDate?: string | null;

  /** Lượng nhập ban đầu (đơn vị cơ sở), không đổi sau khi tạo. */
  @AutoMap()
  @Column({
    name: 'quantity_column',
    type: 'decimal',
    precision: 18,
    scale: 6,
    transformer: decimalToNumber,
  })
  quantity: number;

  /** Lượng còn lại (đơn vị cơ sở), `0 <= remainingQuantity <= quantity`. */
  @AutoMap()
  @Column({
    name: 'remaining_quantity_column',
    type: 'decimal',
    precision: 18,
    scale: 6,
    transformer: decimalToNumber,
  })
  remainingQuantity: number;

  /**
   * Lượng đang giữ chỗ cho phiếu xuất `PENDING` (đơn vị cơ sở), `0 <= reservedQuantity <=
   * remainingQuantity`. Còn trống để giữ tiếp = `remainingQuantity - reservedQuantity`.
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

  @AutoMap()
  @Column({ name: 'status_column', type: 'tinyint', default: MaterialBatchStatus.InStock })
  status: MaterialBatchStatus;
}
