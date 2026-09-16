import { Entity, Column } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';

/**
 * Cache một chiều thông tin doanh nghiệp do cơ quan thuế công bố, khoá tự nhiên là `taxCode`.
 *
 * Kế thừa `Base` chứ KHÔNG phải `VersionedBase`: người dùng không bao giờ sửa tay bảng này (đường
 * ghi duy nhất là 1 lần sync từ upstream), nên không có luồng form-edit để mà tranh chấp.
 *
 * Cố ý KHÔNG có FK tới `Store` — tra cứu được mã số thuế chưa gắn với `Store` nào, và nhiều `Store`
 * cùng pháp nhân dùng chung 1 bản ghi (xem `docs/specs/tax-profile.md`).
 */
@Entity('tax_profile_tbl')
export class TaxProfile extends Base {
  @AutoMap()
  @Column({ name: 'tax_code_column', unique: true })
  taxCode: string;

  @AutoMap()
  @Column({ name: 'name_column' })
  name: string;

  // Upstream trả `null` cho 2 field này với khá nhiều doanh nghiệp (đã thấy ở `0100109106`).
  @AutoMap()
  @Column({ name: 'international_name_column', nullable: true })
  internationalName?: string;

  @AutoMap()
  @Column({ name: 'short_name_column', nullable: true })
  shortName?: string;

  @AutoMap()
  @Column({ name: 'address_column', nullable: true })
  address?: string;

  @AutoMap()
  @Column({ name: 'status_column', nullable: true })
  status?: string;

  /**
   * `metadata.updatedAt` của upstream — mốc dữ liệu BÊN CƠ QUAN THUẾ, không phải mốc sync của ta.
   * Mốc sync gần nhất chính là `updatedAt` của `Base` (đường ghi duy nhất là sync).
   */
  @AutoMap()
  @Column({ name: 'source_updated_at_column', type: 'datetime', nullable: true })
  sourceUpdatedAt?: Date;
}
