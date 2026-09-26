import { Column, Entity, OneToMany } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Permission } from 'src/permission/permission.entity';

@Entity('role_tbl')
export class Role extends Base {
  @AutoMap()
  @Column({ name: 'name_column', nullable: false })
  name: string;

  @AutoMap()
  @Column({ name: 'description_column', nullable: true })
  description?: string;

  // Cấp của role — số lớn = cấp cao. Chỉ sửa được role / gán được role có `level` thấp hơn role của
  // mình (xem `RoleService.assertCanManage`). Nằm ở DB chứ không phải `RoleEnum` để role thêm mới
  // qua API cũng xếp được vào thứ bậc.
  @AutoMap()
  @Column({ name: 'level_column', type: 'int', default: 0 })
  level: number;

  @OneToMany(() => Permission, (permission) => permission.role)
  permissions: Permission[];
}
