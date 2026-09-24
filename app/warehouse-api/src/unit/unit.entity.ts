import { Entity, Column, OneToMany } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { MaterialUnit } from 'src/material/material-unit.entity';

@Entity('unit_tbl')
export class Unit extends Base {
  @AutoMap()
  @Column({ name: 'name_column', unique: true })
  name: string;

  @AutoMap()
  @Column({ name: 'code_column', unique: true })
  code: string;

  @AutoMap()
  @Column({ name: 'description_column', nullable: true })
  description?: string;

  // Phía NGHỊCH của quan hệ N-N (nay đi qua entity trung gian `MaterialUnit` vì bảng join mang
  // thêm `conversion_rate`/`quantity`). Khai ở đây chỉ để truy ngược Unit -> Material khi cần,
  // KHÔNG mang `@AutoMap()` — response của unit không kèm danh sách material.
  //
  // Lưu ý: đây CHỈ là các tham chiếu "đơn vị quy đổi". Vật tư còn tham chiếu Unit theo đường thứ
  // hai là `Material.baseUnit` (FK trực tiếp) — `GET /units/:slug/material-count` và rào
  // `UNIT_IN_USE` lúc xoá phải đếm cả hai đường.
  @OneToMany(() => MaterialUnit, (materialUnit) => materialUnit.unit)
  materialUnits: MaterialUnit[];
}
