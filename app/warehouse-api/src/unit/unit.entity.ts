import { Entity, Column, ManyToMany } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { VersionedBase } from 'src/app/versioned.entity';
import { Material } from 'src/material/material.entity';

@Entity('unit_tbl')
export class Unit extends VersionedBase {
  @AutoMap()
  @Column({ name: 'name_column', unique: true })
  name: string;

  @AutoMap()
  @Column({ name: 'code_column', unique: true })
  code: string;

  @AutoMap()
  @Column({ name: 'description_column', nullable: true })
  description?: string;

  // Phía NGHỊCH của quan hệ N-N: `@JoinTable` (owning side) nằm ở `Material.unitsCanHave`, bảng
  // join là `material_unit_can_have_tbl`. Khai ở đây chỉ để truy ngược Unit -> Material khi cần,
  // KHÔNG mang `@AutoMap()` — response của unit không kèm danh sách material.
  @ManyToMany(() => Material, (material) => material.unitsCanHave)
  materials: Material[];
}
