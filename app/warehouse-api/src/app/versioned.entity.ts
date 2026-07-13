import { AutoMap } from '@automapper/classes';
import { VersionColumn } from 'typeorm';
import { Base } from './base.entity';

// Dùng cho entity có luồng "load full ra sửa nhiều field qua form rồi lưu lại"
// (form-edit) — không áp cho entity chỉ có thao tác atomic tăng/giảm hoặc log append-only.
export abstract class VersionedBase extends Base {
  @AutoMap()
  @VersionColumn({ name: 'version_column' })
  version: number;
}
