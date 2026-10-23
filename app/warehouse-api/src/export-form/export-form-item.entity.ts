import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Material } from 'src/material/material.entity';
import { Unit } from 'src/unit/unit.entity';
import { MaterialBatch } from 'src/material-batch/material-batch.entity';
import { decimalToNumber } from 'src/shared/utils/decimal.transformer';
import { ExportForm } from './export-form.entity';

const decimal = (name: string, scale: number) =>
  Column({ name, type: 'decimal', precision: 18, scale, transformer: decimalToNumber });

/**
 * 1 dòng vật tư của phiếu xuất. Giống `ImportFormItem` (snapshot mã/tên vật tư + đơn vị + tỉ lệ
 * quy đổi; `baseQuantity` = `quantity × conversionRate` là lượng trừ khỏi tồn), không có nhà cung
 * cấp, thêm `batch`:
 * - Client chỉ định lô (`batchSlug`) ⇒ xác nhận trừ đúng lô đó.
 * - Không chỉ định ⇒ `batch` NULL lúc nháp; xác nhận trừ theo FEFO và GÁN `batch` cho dòng. Cần
 *   nhiều lô thì dòng được TÁCH thành nhiều dòng, mỗi dòng 1 lô (tổng số lượng/thành tiền giữ nguyên).
 *
 * Vì tách dòng nên KHÔNG có UNIQUE (phiếu, vật tư, đơn vị) như phiếu nhập; service tự chặn trùng
 * (vật tư, đơn vị, lô) trong body.
 */
@Entity('export_form_item_tbl')
export class ExportFormItem extends Base {
  @ManyToOne(() => ExportForm, (form) => form.items, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'export_form_id_column' })
  exportForm: ExportForm;

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

  /** Lô bị trừ. NULL = phiếu nháp chưa chỉ định lô (xác nhận sẽ gán theo FEFO). */
  @ManyToOne(() => MaterialBatch, { nullable: true })
  @JoinColumn({ name: 'batch_id_column' })
  batch?: MaterialBatch | null;

  @AutoMap()
  @decimal('quantity_column', 6)
  quantity: number;

  @AutoMap()
  @decimal('conversion_rate_column', 6)
  conversionRate: number;

  @AutoMap()
  @decimal('base_quantity_column', 6)
  baseQuantity: number;

  @AutoMap()
  @decimal('unit_price_column', 2)
  unitPrice: number;

  @AutoMap()
  @decimal('amount_column', 2)
  amount: number;

  @AutoMap()
  @Column({ name: 'note_column', type: 'text', nullable: true })
  note?: string | null;
}
