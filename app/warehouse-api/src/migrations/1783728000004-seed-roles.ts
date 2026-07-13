import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { getRandomString } from 'src/app/app.subscriber';

// Seed role tối thiểu để test đăng ký/đăng nhập ngay sau khi migrate — xem setup.md mục
// "Bắt buộc: seed Role trước khi test login/register".
export class SeedRoles1783728000004 implements MigrationInterface {
  name = 'SeedRoles1783728000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const roles = [
      { slug: getRandomString(), name: 'SUPERVISOR', description: 'Supervisor role' },
      { slug: getRandomString(), name: 'MANAGER', description: 'Manager role' },
      { slug: getRandomString(), name: 'ADMIN', description: 'Admin role' },
      { slug: getRandomString(), name: 'SUPER_ADMIN', description: 'Super admin role' },
    ];

    for (const role of roles) {
      await queryRunner.query(
        `INSERT INTO \`role_tbl\` (\`id_column\`, \`slug_column\`, \`name_column\`, \`description_column\`)
         VALUES (?, ?, ?, ?)`,
        [uuidv4(), role.slug, role.name, role.description],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM \`role_tbl\` WHERE \`name_column\` IN ('SUPERVISOR', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')`,
    );
  }
}
