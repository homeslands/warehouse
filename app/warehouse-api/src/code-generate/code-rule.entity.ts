import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { CodeType } from './code-generate.constants';

/**
 * Quy tắc sinh mã: 1 dòng = 1 `CodeType`, giữ tiền tố in lên mã. Seed đủ mọi `CodeType` ở migration
 * `1783728000049` — API chỉ đọc/sửa, không tạo/xoá (loại mã là enum cố định trong code).
 *
 * KHÔNG kế thừa `Base` (giống `CodeSequence`): `type` đã là khoá ổn định và là định danh trên route
 * (`/code-rules/:type`), không cần `slug`/soft-delete.
 *
 * Đổi `prefix` không làm cấp trùng: mã cũ mang tiền tố cũ, bộ đếm (`code_sequence_tbl`) vẫn chạy
 * tiếp theo `type` chứ không theo tiền tố.
 */
@Entity('code_rule_tbl')
export class CodeRule {
  @AutoMap()
  @PrimaryColumn({ name: 'type_column', type: 'varchar', length: 32 })
  type: CodeType;

  @AutoMap()
  @Column({ name: 'prefix_column', type: 'varchar', length: 2 })
  prefix: string;

  @AutoMap()
  @Column({ name: 'description_column', type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  @AutoMap()
  @UpdateDateColumn({ name: 'updated_at_column' })
  updatedAt: Date;
}
