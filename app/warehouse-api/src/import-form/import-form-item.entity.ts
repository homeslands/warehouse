import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Material } from 'src/material/material.entity';
import { Unit } from 'src/unit/unit.entity';
import { decimalToNumber } from 'src/shared/utils/decimal.transformer';
import { ImportForm } from './import-form.entity';
import { ITEM_CODE_MAX_LENGTH } from './import-form.constants';
import { MaterialBatch } from 'src/material-batch/material-batch.entity';

/**
 * 1 dòng của phiếu nhập = 1 ĐƠN VỊ hàng (theo `unit` của dòng, `quantity` luôn = 1) mang 1 mã riêng
 * `code` (`CodeType.Item`), sinh ngay lúc thêm vào phiếu nháp (`POST .../import-forms/:slug/items`):
 * quét 1 lần = 1 dòng, nhập tay `quantity` = N ⇒ N dòng. Xác nhận phiếu chép `code` sang lô sinh từ
 * dòng (1 dòng ⇒ 1 lô). Dòng ghi trước khi có luồng này giữ `quantity` cũ và `code` = NULL.
 *
 * Mọi thứ đọc được từ danh mục đều được **snapshot** lúc ghi: `conversionRate` (tỉ lệ trên
 * `MaterialUnit` sửa được bất cứ lúc nào — join sang nó lúc đọc là viết lại quá khứ, xem CLAUDE.md),
 * mã/tên vật tư và đơn vị, và nhà cung cấp của vật tư (`supplier*` — phiếu nhập không gắn nhà cung
 * cấp ở đầu phiếu; vật tư đổi/gỡ nhà cung cấp sau đó không viết lại dòng cũ). `baseQuantity` = `quantity × conversionRate` là lượng sẽ cộng vào tồn
 * (tồn luôn tính theo đơn vị cơ sở). `amount` = `quantity × unitPrice` do server tính.
 *
 * Ghi tường minh trong transaction của `ImportFormService` (thêm/gỡ dòng, khoá đầu phiếu), không qua
 * cascade. Không có UNIQUE (phiếu, vật tư, đơn vị) — cùng vật tư/đơn vị lặp lại 1 dòng mỗi đơn vị.
 */
@Entity('import_form_item_tbl')
@Index('IDX_import_form_item_form_line', ['importForm', 'lineNo'])
export class ImportFormItem extends Base {
  @ManyToOne(() => ImportForm, (form) => form.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'import_form_id_column' })
  importForm: ImportForm;

  /** Thứ tự thêm vào phiếu (1, 2, ...), tăng dần, không đánh lại khi gỡ dòng. */
  @AutoMap()
  @Column({ name: 'line_no_column', type: 'int' })
  lineNo: number;

  /** Mã đơn vị hàng, duy nhất toàn hệ thống. NULL chỉ ở dòng cũ ghi trước khi có mã. */
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
   * Snapshot nhà cung cấp của vật tư lúc ghi dòng — chỉ là cột chép, KHÔNG có FK sang `supplier_tbl`.
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

  @AutoMap()
  @Column({
    name: 'quantity_column',
    type: 'decimal',
    precision: 18,
    scale: 6,
    transformer: decimalToNumber,
  })
  quantity: number;

  @AutoMap()
  @Column({
    name: 'conversion_rate_column',
    type: 'decimal',
    precision: 18,
    scale: 6,
    transformer: decimalToNumber,
  })
  conversionRate: number;

  @AutoMap()
  @Column({
    name: 'base_quantity_column',
    type: 'decimal',
    precision: 18,
    scale: 6,
    transformer: decimalToNumber,
  })
  baseQuantity: number;

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

  /**
   * Hạn dùng (`YYYY-MM-DD`) của hàng trên dòng này, không bắt buộc. Xác nhận phiếu chép nó sang lô
   * (`MaterialBatch.expiryDate`) sinh từ dòng.
   */
  @AutoMap()
  @Column({ name: 'expiry_date_column', type: 'date', nullable: true })
  expiryDate?: string | null;

  /** Lô sinh ra khi phiếu được xác nhận (1 dòng ⇒ 1 lô). Không cascade — lô do `MaterialBatchService` ghi. */
  @OneToMany(() => MaterialBatch, (batch) => batch.importFormItem)
  batches?: MaterialBatch[];
}
