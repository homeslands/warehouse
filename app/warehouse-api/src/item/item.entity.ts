import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Material } from 'src/material/material.entity';
import { Unit } from 'src/unit/unit.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { ImportForm } from 'src/import-form/import-form.entity';
import { decimalToNumber } from 'src/shared/utils/decimal.transformer';
import { ITEM_STATUS_MAX_LENGTH, ItemStatus } from './item.constants';
import { ITEM_CODE_MAX_LENGTH } from 'src/import-form/import-form.constants';

/**
 * 1 đơn vị hàng (`quantity` = 1 theo `unit` đã chọn) mang 1 mã riêng `code` (`CodeType.Item`), đồng
 * thời là 1 dòng của phiếu nhập sinh ra nó (`importForm` + `lineNo`). Sinh lúc thêm vào phiếu nhập
 * NHÁP (`POST .../import-forms/:slug/items`): quét 1 lần = 1 item, nhập tay `quantity` = N ⇒ N item.
 *
 * Vòng đời theo phiếu nhập (`ItemStatus`): nháp ⇒ `PENDING` (không tính vào tồn, FEFO bỏ qua); xác
 * nhận phiếu ⇒ `IN_STOCK` + cộng `baseQuantity` vào tồn; huỷ phiếu ⇒ `VOID`; gỡ khỏi nháp / xoá nháp
 * ⇒ xoá cứng. Sau đó phiếu xuất giữ chỗ (`reservedQuantity`) và trừ `remainingQuantity`
 * (`ItemService`). Không có API tạo/sửa/xoá item riêng.
 *
 * Mọi thứ đọc được từ danh mục đều được **snapshot** lúc ghi: `conversionRate` (tỉ lệ trên
 * `MaterialUnit` sửa được bất cứ lúc nào — join sang nó lúc đọc là viết lại quá khứ, xem CLAUDE.md),
 * mã/tên vật tư và đơn vị, và nhà cung cấp của vật tư (`supplier*`). `baseQuantity` =
 * `quantity × conversionRate` là lượng cộng vào tồn; `remainingQuantity`/`reservedQuantity` cũng theo
 * ĐƠN VỊ CƠ SỞ (cùng đơn vị với `Inventory.quantity`). `amount` = `quantity × unitPrice` do server tính.
 *
 * Kế thừa `Base` chứ không `VersionedBase`: như `Inventory`, chống ghi đè đồng thời bằng pessimistic
 * lock trong transaction (đầu phiếu nhập lúc còn nháp, chính item khi phiếu xuất đụng tới).
 * `warehouse` thừa so với `importForm.warehouse` nhưng cố ý giữ: FEFO luôn tra theo (kho, vật tư).
 *
 * Item ghi trước migration `1783728000056` (chép từ `import_form_item_tbl`) có thể có `quantity` ≠ 1
 * và `code` = NULL.
 */
@Entity('item_tbl')
@Index('IDX_item_fefo', ['warehouse', 'material', 'status', 'expiryDate'])
@Index('IDX_item_form_line', ['importForm', 'lineNo'])
export class Item extends Base {
  @ManyToOne(() => ImportForm, (form) => form.items, { nullable: false })
  @JoinColumn({ name: 'import_form_id_column' })
  importForm: ImportForm;

  /** Thứ tự thêm vào phiếu nhập (1, 2, ...), tăng dần, không đánh lại khi gỡ item. */
  @AutoMap()
  @Column({ name: 'line_no_column', type: 'int' })
  lineNo: number;

  /** Mã đơn vị hàng, duy nhất toàn hệ thống. NULL chỉ ở item cũ ghi trước khi có mã. */
  @AutoMap()
  @Column({
    name: 'code_column',
    type: 'varchar',
    length: ITEM_CODE_MAX_LENGTH,
    nullable: true,
    unique: true,
  })
  code?: string | null;

  @ManyToOne(() => Material, { nullable: false })
  @JoinColumn({ name: 'material_id_column' })
  material: Material;

  @AutoMap()
  @Column({ name: 'material_code_column' })
  materialCode: string;

  @AutoMap()
  @Column({ name: 'material_name_column' })
  materialName: string;

  @ManyToOne(() => Unit, { nullable: false })
  @JoinColumn({ name: 'unit_id_column' })
  unit: Unit;

  @AutoMap()
  @Column({ name: 'unit_code_column' })
  unitCode: string;

  @AutoMap()
  @Column({ name: 'unit_name_column' })
  unitName: string;

  /**
   * Snapshot nhà cung cấp của vật tư lúc ghi — chỉ là cột chép, KHÔNG có FK sang `supplier_tbl`.
   * NULL khi vật tư chưa gắn nhà cung cấp. Ghi `null` chứ không `undefined` (TypeORM bỏ qua
   * `undefined` lúc `save()`).
   */
  @AutoMap()
  @Column({ name: 'supplier_slug_column', type: 'varchar', nullable: true })
  supplierSlug?: string | null;

  @AutoMap()
  @Column({ name: 'supplier_code_column', type: 'varchar', length: 32, nullable: true })
  supplierCode?: string | null;

  @AutoMap()
  @Column({ name: 'supplier_name_column', type: 'varchar', nullable: true })
  supplierName?: string | null;

  @AutoMap()
  @Column({ name: 'supplier_tax_code_column', type: 'varchar', length: 14, nullable: true })
  supplierTaxCode?: string | null;

  @AutoMap()
  @Column({ name: 'supplier_address_column', type: 'varchar', nullable: true })
  supplierAddress?: string | null;

  @ManyToOne(() => Warehouse, { nullable: false })
  @JoinColumn({ name: 'warehouse_id_column' })
  warehouse: Warehouse;

  /** Ngày nhập (`YYYY-MM-DD`) = `date` của phiếu nhập (đổi theo khi PATCH ngày phiếu nháp). */
  @AutoMap()
  @Column({ name: 'entry_date_column', type: 'date' })
  entryDate: string;

  /** Hạn dùng (`YYYY-MM-DD`), `null` = không có hạn — FEFO xếp các item này sau cùng. */
  @AutoMap()
  @Column({ name: 'expiry_date_column', type: 'date', nullable: true })
  expiryDate?: string | null;

  /** Số lượng theo `unit` — luôn 1 (1 item = 1 đơn vị hàng), trừ item cũ chép từ dòng phiếu. */
  @AutoMap()
  @Column({
    name: 'quantity_column',
    type: 'decimal',
    precision: 18,
    scale: 6,
    transformer: decimalToNumber,
  })
  quantity: number;

  /** Số đơn vị cơ sở trong 1 `unit`, snapshot lúc ghi. */
  @AutoMap()
  @Column({
    name: 'conversion_rate_column',
    type: 'decimal',
    precision: 18,
    scale: 6,
    transformer: decimalToNumber,
  })
  conversionRate: number;

  /** Lượng nhập (đơn vị cơ sở) = `quantity × conversionRate`, không đổi sau khi tạo. */
  @AutoMap()
  @Column({
    name: 'base_quantity_column',
    type: 'decimal',
    precision: 18,
    scale: 6,
    transformer: decimalToNumber,
  })
  baseQuantity: number;

  /** Lượng còn lại (đơn vị cơ sở), `0 <= remainingQuantity <= baseQuantity`. */
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
   * Lượng đang giữ chỗ cho phiếu xuất `DRAFT`/`PENDING` (đơn vị cơ sở), `0 <= reservedQuantity <=
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
  @Column({
    name: 'unit_price_column',
    type: 'decimal',
    precision: 18,
    scale: 2,
    transformer: decimalToNumber,
  })
  unitPrice: number;

  @AutoMap()
  @Column({
    name: 'amount_column',
    type: 'decimal',
    precision: 18,
    scale: 2,
    transformer: decimalToNumber,
  })
  amount: number;

  @AutoMap()
  @Column({ name: 'note_column', type: 'text', nullable: true })
  note?: string | null;

  /** Vòng đời item (`ItemStatus`) — xem `statusOfItem` cho phần do phiếu xuất quyết định. */
  @AutoMap()
  @Column({
    name: 'status_column',
    type: 'varchar',
    length: ITEM_STATUS_MAX_LENGTH,
    default: ItemStatus.Pending,
  })
  status: ItemStatus;
}
