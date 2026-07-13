import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { getRandomString } from 'src/app/app.subscriber';

// Seed authority cho feature user (xem docs/specs/user.md).
// Không tự phát hiện @RequireAuthority(...) lúc runtime — mỗi authority mới phải seed tay
// bằng migration như file này, viết kèm ngay khi gắn decorator lên endpoint.
export class SeedUserAuthority1783728000010 implements MigrationInterface {
  name = 'SeedUserAuthority1783728000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const groupId = uuidv4();
    await queryRunner.query(
      `INSERT INTO \`authority_group_tbl\` (\`id_column\`, \`slug_column\`, \`name_column\`)
       VALUES (?, ?, ?)`,
      [groupId, getRandomString(), 'User Management'],
    );

    const authorities = [
      { id: uuidv4(), slug: getRandomString(), name: 'Create user', code: 'USER_CREATE' },
      { id: uuidv4(), slug: getRandomString(), name: 'List user', code: 'USER_READ' },
    ];
    for (const authority of authorities) {
      await queryRunner.query(
        `INSERT INTO \`authority_tbl\`
           (\`id_column\`, \`slug_column\`, \`name_column\`, \`code_column\`, \`authority_group_id_column\`)
         VALUES (?, ?, ?, ?, ?)`,
        [authority.id, authority.slug, authority.name, authority.code, groupId],
      );
    }

    const [adminRole] = await queryRunner.query(
      `SELECT \`id_column\` AS id FROM \`role_tbl\` WHERE \`name_column\` = 'ADMIN' LIMIT 1`,
    );
    if (!adminRole) return;

    for (const authority of authorities) {
      await queryRunner.query(
        `INSERT INTO \`permission_tbl\` (\`id_column\`, \`slug_column\`, \`role_id_column\`, \`authority_id_column\`)
         VALUES (?, ?, ?, ?)`,
        [uuidv4(), getRandomString(), adminRole.id, authority.id],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM \`permission_tbl\` WHERE \`authority_id_column\` IN
        (SELECT \`id_column\` FROM \`authority_tbl\` WHERE \`code_column\` IN ('USER_CREATE', 'USER_READ'))`,
    );
    await queryRunner.query(
      `DELETE FROM \`authority_tbl\` WHERE \`code_column\` IN ('USER_CREATE', 'USER_READ')`,
    );
    await queryRunner.query(
      `DELETE FROM \`authority_group_tbl\` WHERE \`name_column\` = 'User Management'`,
    );
  }
}
