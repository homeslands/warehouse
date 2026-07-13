import { AutoMap } from '@automapper/classes';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export class Base {
  @PrimaryGeneratedColumn('uuid', { name: 'id_column' })
  id: string;

  @AutoMap()
  @Column({ name: 'slug_column', unique: true })
  slug: string;

  @AutoMap()
  @CreateDateColumn({ name: 'created_at_column' })
  createdAt: Date;

  @AutoMap()
  @UpdateDateColumn({ name: 'updated_at_column' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at_column' })
  deletedAt?: Date;

  @Column({ name: 'created_by_column', nullable: true })
  createdBy?: string;
}
