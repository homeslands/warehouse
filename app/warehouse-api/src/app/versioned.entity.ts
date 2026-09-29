import { AutoMap } from '@automapper/classes';
import { VersionColumn } from 'typeorm';
import { Base } from './base.entity';

// Chỉ dùng cho phiếu nhập/xuất/kiểm kho (import/export/balance form). Danh mục/master data
// (kho, cửa hàng, vật tư, loại vật tư, đơn vị) kế thừa `Base` — xem migration `1783728000024`.
export abstract class VersionedBase extends Base {
  @AutoMap()
  @VersionColumn({ name: 'version_column' })
  version: number;
}
