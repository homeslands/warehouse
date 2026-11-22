import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { CodeType } from './code-generate.constants';

/**
 * Bộ đếm sinh mã: 1 dòng = 1 (loại mã, kho, ngày). `lastValue` là số thứ tự đã cấp gần nhất.
 *
 * KHÔNG kế thừa `Base` (giống `MaterialUnit`): không `id`/`slug`/soft-delete, không lộ ra API.
 * Chỉ ghi qua `CodeGenerateService` dưới `SELECT ... FOR UPDATE` — không sửa tay, giảm giá trị là
 * cấp lại mã đã dùng.
 */
@Entity('code_sequence_tbl')
export class CodeSequence {
  @PrimaryColumn({ name: 'type_column', type: 'varchar', length: 32 })
  type: CodeType;

  @PrimaryColumn({ name: 'warehouse_id_column', type: 'varchar', length: 36 })
  warehouseId: string;

  /** `yymmdd` theo `CODE_TIMEZONE`. */
  @PrimaryColumn({ name: 'period_column', type: 'char', length: 6 })
  period: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'warehouse_id_column' })
  warehouse?: Warehouse;

  @Column({ name: 'last_value_column', type: 'int', unsigned: true, default: 0 })
  lastValue: number;

  @UpdateDateColumn({ name: 'updated_at_column' })
  updatedAt: Date;
}
