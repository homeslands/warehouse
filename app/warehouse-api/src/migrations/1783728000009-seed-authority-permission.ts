import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { getRandomString } from 'src/app/app.subscriber';

// Seed authority cho feature authority-permission (xem docs/specs/authority-permission.md).
// Không tự phát hiện @RequireAuthority(...) lúc runtime — mỗi authority mới phải seed tay
// bằng migration như file này, viết kèm ngay khi gắn decorator lên endpoint.
export class SeedAuthorityPermission1783728000009 implements MigrationInterface {
  name = 'SeedAuthorityPermission1783728000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const groups = [
      { id: uuidv4(), slug: getRandomString(), name: 'Example' },
      { id: uuidv4(), slug: getRandomString(), name: 'Permission Management' },
      { id: uuidv4(), slug: getRandomString(), name: 'System' },
    ];
    for (const group of groups) {
      await queryRunner.query(
        `INSERT INTO \`authority_group_tbl\` (\`id_column\`, \`slug_column\`, \`name_column\`)
         VALUES (?, ?, ?)`,
        [group.id, group.slug, group.name],
      );
    }
    const exampleGroupId = groups[0].id;
    const permissionManagementGroupId = groups[1].id;
    const systemGroupId = groups[2].id;

    const authorities = [
      {
        id: uuidv4(),
        slug: getRandomString(),
        name: 'Create example',
        code: 'EXAMPLE_CREATE',
        groupId: exampleGroupId,
      },
      {
        id: uuidv4(),
        slug: getRandomString(),
        name: 'Update example',
        code: 'EXAMPLE_UPDATE',
        groupId: exampleGroupId,
      },
      {
        id: uuidv4(),
        slug: getRandomString(),
        name: 'Delete example',
        code: 'EXAMPLE_DELETE',
        groupId: exampleGroupId,
      },
      {
        id: uuidv4(),
        slug: getRandomString(),
        name: 'Manage permissions',
        code: 'MANAGE_PERMISSIONS',
        groupId: permissionManagementGroupId,
      },
      {
        id: uuidv4(),
        slug: getRandomString(),
        name: 'Backup database',
        code: 'DB_BACKUP',
        groupId: systemGroupId,
      },
      {
        id: uuidv4(),
        slug: getRandomString(),
        name: 'Read logs',
        code: 'LOGGER_READ',
        groupId: systemGroupId,
      },
    ];
    for (const authority of authorities) {
      await queryRunner.query(
        `INSERT INTO \`authority_tbl\`
           (\`id_column\`, \`slug_column\`, \`name_column\`, \`code_column\`, \`authority_group_id_column\`)
         VALUES (?, ?, ?, ?, ?)`,
        [authority.id, authority.slug, authority.name, authority.code, authority.groupId],
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
    const authorityCodes = [
      'EXAMPLE_CREATE',
      'EXAMPLE_UPDATE',
      'EXAMPLE_DELETE',
      'MANAGE_PERMISSIONS',
      'DB_BACKUP',
      'LOGGER_READ',
    ];
    await queryRunner.query(
      `DELETE FROM \`permission_tbl\` WHERE \`authority_id_column\` IN
        (SELECT \`id_column\` FROM \`authority_tbl\` WHERE \`code_column\` IN (${authorityCodes.map(() => '?').join(', ')}))`,
      authorityCodes,
    );
    await queryRunner.query(
      `DELETE FROM \`authority_tbl\` WHERE \`code_column\` IN (${authorityCodes.map(() => '?').join(', ')})`,
      authorityCodes,
    );
    await queryRunner.query(
      `DELETE FROM \`authority_group_tbl\` WHERE \`name_column\` IN ('Example', 'Permission Management', 'System')`,
    );
  }
}
