import { readFileSync } from 'fs';
import { join } from 'path';
import { ALLOWED_FAMILIES } from './permission-policy';

/** Khoá bản sao policy với contract R2 (`docs/project/baseline/contracts/permission-policy.json`). */
describe('permission policy copy (family ceiling)', () => {
  it('matches allowed_families of every code in the R2 contract exactly', () => {
    const path = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'docs',
      'project',
      'baseline',
      'contracts',
      'permission-policy.json',
    );
    const contract: Array<{ code: string; allowed_families: string[] }> = JSON.parse(
      readFileSync(path, 'utf8'),
    );
    expect(Object.keys(ALLOWED_FAMILIES).sort()).toEqual(
      contract.map((entry) => entry.code).sort(),
    );
    for (const entry of contract)
      expect(ALLOWED_FAMILIES[entry.code]).toEqual(entry.allowed_families);
  });

  it('keeps W02 admin operations ADMIN-only', () => {
    for (const code of [
      'ROLE_READ',
      'ROLE_UPDATE',
      'ROLE_DELETE',
      'MANAGE_PERMISSIONS',
      'USER_CHANGE_ROLE',
    ])
      expect(ALLOWED_FAMILIES[code]).toEqual(['ADMIN']);
  });
});
