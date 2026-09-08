import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { getRandomString } from 'src/app/app.subscriber';

// Seed authority cho `POST /users/{userSlug}/change-password` (@RequireAuthority trên UserController).
// Gắn vào nhóm 'User Management' đã tạo ở 1783728000010 thay vì tạo nhóm mới.
// Cấp sẵn cho ADMIN và MANAGER; SUPER_ADMIN bypass nên không cần row permission.
export class SeedChangePasswordAuthority1783728000011 implements MigrationInterface {
  name = 'SeedChangePasswordAuthority1783728000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [group] = await queryRunner.query(
      `SELECT \`id_column\` AS id FROM \`authority_group_tbl\`
       WHERE \`name_column\` = 'User Management' LIMIT 1`,
    );
    if (!group) return;

    const authorityId = uuidv4();
    await queryRunner.query(
      `INSERT INTO \`authority_tbl\`
         (\`id_column\`, \`slug_column\`, \`name_column\`, \`code_column\`, \`authority_group_id_column\`)
       VALUES (?, ?, ?, ?, ?)`,
      [
        authorityId,
        getRandomString(),
        'Change password of a user',
        'USER_CHANGE_PASSWORD',
        group.id,
      ],
    );

    const roles = await queryRunner.query(
      `SELECT \`id_column\` AS id FROM \`role_tbl\` WHERE \`name_column\` IN ('ADMIN', 'MANAGER')`,
    );
    for (const role of roles) {
      await queryRunner.query(
        `INSERT INTO \`permission_tbl\` (\`id_column\`, \`slug_column\`, \`role_id_column\`, \`authority_id_column\`)
         VALUES (?, ?, ?, ?)`,
        [uuidv4(), getRandomString(), role.id, authorityId],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM \`permission_tbl\` WHERE \`authority_id_column\` IN
        (SELECT \`id_column\` FROM \`authority_tbl\` WHERE \`code_column\` = 'USER_CHANGE_PASSWORD')`,
    );
    await queryRunner.query(
      `DELETE FROM \`authority_tbl\` WHERE \`code_column\` = 'USER_CHANGE_PASSWORD'`,
    );
  }
}
