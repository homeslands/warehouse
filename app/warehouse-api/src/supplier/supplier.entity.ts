import { Entity, Column, ManyToMany } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { Material } from 'src/material/material.entity';

@Entity('supplier_tbl')
export class Supplier extends Base {
  @AutoMap()
  @Column({ name: 'code_column', unique: true })
  code: string;

  // Cố ý KHÔNG unique: 2 nhà cung cấp khác nhau được phép trùng tên, `code` mới là khoá nghiệp vụ.
  @AutoMap()
  @Column({ name: 'name_column' })
  name: string;

  @AutoMap()
  @Column({ name: 'tax_code_column', nullable: true })
  taxCode?: string;

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
  @Column({ name: 'contact_person_column', nullable: true })
  contactPerson?: string;

  @AutoMap()
  @Column({ name: 'note_column', type: 'text', nullable: true })
  note?: string;

  /**
   * n nhà cung cấp - n vật tư qua bảng join `material_supplier_tbl` (phía sở hữu là
   * `Material.suppliers`). Gắn/gỡ qua `PUT|DELETE /suppliers/:slug/materials` (body
   * `materialSlugs`) hoặc `PUT /materials/:slug/suppliers`, không qua DTO của vật tư.
   */
  @ManyToMany(() => Material, (material) => material.suppliers)
  materials: Material[];
}
