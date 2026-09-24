import { Entity, Column, OneToOne, JoinColumn } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { VersionedBase } from 'src/app/versioned.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';

/**
 * Cửa hàng — pháp nhân quản lý sản phẩm và đứng tên trên hoá đơn. Mỗi cửa hàng gắn tối đa 1 kho
 * (`Warehouse`) và 1 kho chỉ thuộc về tối đa 1 cửa hàng (quan hệ 1-1, xem `docs/specs/store.md`).
 */
@Entity('store_tbl')
export class Store extends VersionedBase {
  @AutoMap()
  @Column({ name: 'name_column' })
  name: string;

  @AutoMap()
  @Column({ name: 'code_column', unique: true })
  code: string;

  @AutoMap()
  @Column({ name: 'legal_name_column' })
  legalName: string;

  @AutoMap()
  @Column({ name: 'tax_code_column' })
  taxCode: string;

  @AutoMap()
  @Column({ name: 'invoice_address_column', nullable: true })
  invoiceAddress?: string;

  @AutoMap()
  @Column({ name: 'phonenumber_column', nullable: true })
  phonenumber?: string;

  @AutoMap()
  @Column({ name: 'email_column', nullable: true })
  email?: string;

  @AutoMap()
  @Column({ name: 'address_column', nullable: true })
  address?: string;

  @AutoMap()
  @Column({ name: 'is_active_column', default: true })
  isActive: boolean;

  /**
   * `Store` là owning side của quan hệ 1-1: cột FK + UNIQUE index nằm ở `store_tbl` — chính UNIQUE
   * đó là thứ chặn 2 cửa hàng cùng trỏ vào 1 kho ở tầng DB.
   *
   * Cố ý KHÔNG `eager` (giống `Warehouse.manager`): mọi read path phải tự truyền `relations`, nếu
   * không response im lặng mất `warehouseSlug` mà không có lỗi nào báo ra.
   *
   * Cũng cố ý KHÔNG `@AutoMap()`: `warehouseSlug`/`warehouseName` được flatten bằng `forMember`
   * trong `store.mapper.ts`, và automapper chạm vào field này sẽ ghi đè quan hệ lúc `Object.assign`
   * trong `updateStore`.
   */
  @OneToOne(() => Warehouse, (warehouse) => warehouse.store, { nullable: true })
  @JoinColumn({ name: 'warehouse_id_column' })
  warehouse?: Warehouse | null;
}
