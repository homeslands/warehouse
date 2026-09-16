import { Entity, Column } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { VersionedBase } from 'src/app/versioned.entity';

/**
 * Cửa hàng — pháp nhân quản lý sản phẩm và đứng tên trên hoá đơn. Cố ý KHÔNG có quan hệ nào với
 * `Warehouse`: kho chứa vật tư, cửa hàng bán hàng, 2 khái niệm độc lập (xem `docs/specs/store.md`).
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
}
