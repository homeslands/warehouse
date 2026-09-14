import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { VersionedBase } from 'src/app/versioned.entity';
import { User } from 'src/user/user.entity';

@Entity('warehouse_tbl')
export class Warehouse extends VersionedBase {
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
}
