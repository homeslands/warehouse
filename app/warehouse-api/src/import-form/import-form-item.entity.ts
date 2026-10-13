import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Material } from 'src/material/material.entity';
import { Unit } from 'src/unit/unit.entity';
import { decimalToNumber } from 'src/shared/utils/decimal.transformer';
import { ImportForm } from './import-form.entity';

/**
 * 1 dòng vật tư của phiếu nhập. Chỉ ghi qua API của phiếu cha, không có API riêng.
 *
 * Mọi thứ đọc được từ danh mục đều được **snapshot** lúc ghi: `conversionRate` (tỉ lệ trên
 * `MaterialUnit` sửa được bất cứ lúc nào — join sang nó lúc đọc là viết lại quá khứ, xem CLAUDE.md),
 * mã/tên vật tư và đơn vị, và nhà cung cấp của vật tư (`supplier*` — phiếu nhập không gắn nhà cung
 * cấp ở đầu phiếu; vật tư đổi/gỡ nhà cung cấp sau đó không viết lại dòng cũ). `baseQuantity` = `quantity × conversionRate` là lượng sẽ cộng vào tồn
 * (tồn luôn tính theo đơn vị cơ sở). `amount` = `quantity × unitPrice` do server tính.
 *
 * Ghi tường minh trong transaction của `ImportFormService` (tạo phiếu / PATCH thay dòng), không qua
 * cascade. PATCH gửi `items` = xoá cứng toàn bộ dòng cũ rồi ghi dòng mới, cùng transaction với
 * phần đầu phiếu.
 */
@Entity('import_form_item_tbl')
@Unique('UQ_import_form_item', ['importForm', 'material', 'unit'])
export class ImportFormItem extends Base {
  @ManyToOne(() => ImportForm, (form) => form.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'import_form_id_column' })
  importForm: ImportForm;

  /** Thứ tự dòng theo đúng mảng `items` client gửi (1, 2, ...) — để đọc ra đúng thứ tự đã nhập. */
  @AutoMap()
  @Column({ name: 'line_no_column', type: 'int' })
  lineNo: number;

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
}
