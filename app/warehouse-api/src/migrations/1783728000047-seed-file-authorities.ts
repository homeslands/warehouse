import { MigrationInterface, QueryRunner } from 'typeorm';
import { AuthorityCode } from 'src/authority/authority.constants';
import {
  AuthoritySeed,
  seedAuthorities,
  unseedAuthorities,
} from 'src/authority/authority-seed.util';
import { RoleEnum } from 'src/role/role.enum';

const GROUP = 'File';

/**
 * `defaultRoles` = hợp các role được cấp sẵn `IMPORT_FORM_CREATE`/`_UPDATE_DRAFT`/`_UPDATE_DRAFT_OWN`
 * hoặc `EXPORT_FORM_CREATE`/`_UPDATE_DRAFT`/`_UPDATE_DRAFT_OWN` trong `1783728000012`
 * (ADMIN, SUPERVISOR): form phiếu gọi `POST /file/upload` để đính kèm chứng từ, thiếu quyền này là
 * người đang tạo/sửa phiếu bị 403.
 */
export const FILE_AUTHORITY_SEED: readonly AuthoritySeed[] = [
  {
    code: AuthorityCode.FileCreate,
    name: 'Tải file đính kèm lên',
    group: GROUP,
    defaultRoles: [RoleEnum.Admin, RoleEnum.Supervisor],
  },
];

/**
 * Seed authority cho `POST /file/upload` (`src/file/`) — trước đây route này `@Public()`.
 */
export class SeedFileAuthorities1783728000047 implements MigrationInterface {
  name = 'SeedFileAuthorities1783728000047';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await seedAuthorities(queryRunner, FILE_AUTHORITY_SEED);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await unseedAuthorities(queryRunner, FILE_AUTHORITY_SEED);
  }
}
