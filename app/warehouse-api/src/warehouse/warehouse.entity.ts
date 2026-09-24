import { Entity, Column, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { User } from 'src/user/user.entity';
import { Store } from 'src/store/store.entity';

@Entity('warehouse_tbl')
export class Warehouse extends Base {
  @AutoMap()
  @Column({ name: 'name_column' })
  name: string;

  @AutoMap()
  @Column({ name: 'code_column', unique: true })
  code: string;

  @AutoMap()
  @Column({ name: 'address_column' })
  address: string;

  @AutoMap()
  @Column({ name: 'phonenumber_column', nullable: true })
  phonenumber?: string;

  @AutoMap()
  @Column({ name: 'description_column', nullable: true })
  description?: string;

  @AutoMap()
  @Column({ name: 'is_active_column', default: true })
  isActive: boolean;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'manager_id_column' })
  manager: User;

  /**
   * Inverse side của quan hệ 1-1 với `Store` — KHÔNG có cột nào trên `warehouse_tbl`, FK +
   * UNIQUE nằm ở `store_tbl.warehouse_id_column` (xem `store.entity.ts`). Khai ở đây chỉ để đọc
   * ngược "kho này thuộc cửa hàng nào"; muốn lấy phải truyền `relations: { store: true }`.
   */
  @OneToOne(() => Store, (store) => store.warehouse, { nullable: true })
  store?: Store | null;
}
