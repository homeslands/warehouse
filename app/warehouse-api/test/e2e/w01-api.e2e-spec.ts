import request from 'supertest';
import { In } from 'typeorm';
import { Role } from 'src/role/role.entity';
import { User } from 'src/user/user.entity';
import { AuthorityCode } from 'src/authority/authority.constants';
import { RoleEnum } from 'src/role/role.enum';
import { createHarness, Harness } from '../harness/app';
import { writeEvidence } from '../harness/evidence';
import { ActorAlias, FIXTURE_VERSION, TC06_ROLE } from '../harness/fixture';

/**
 * W01-TC04..07 qua HTTP vào AppModule thật (guard, repository, MySQL, Redis thật) với API LEGACY
 * `POST /auth/login`, `GET /auth/me`, `GET /warehouses[/:slug]`. Token chỉ lấy từ login thật; không
 * actor SUPER_ADMIN. Không phải contract `/api/v1` typed của R2.
 */
describe('W01 legacy API smoke on real composition', () => {
  let harness: Harness;
  const results: Record<string, unknown> = {};

  const http = () => request(harness.app.getHttpServer());
  const url = (path: string) => `${harness.prefix}${path}`;

  const login = async (alias: ActorAlias) => {
    const res = await http().post(url('/auth/login')).send({
      phonenumber: harness.fixture.phonenumbers[alias],
      password: harness.fixture.passwords[alias],
    });
    expect(res.status).toBe(200);
    const accessToken: string = res.body.result.accessToken;
    expect(typeof accessToken).toBe('string');
    return accessToken;
  };

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    writeEvidence('W01-API', {
      level: 'REAL_API_DB_REDIS',
      targetId: harness?.target.id,
      fixtureVersion: FIXTURE_VERSION,
      prefix: harness?.prefix,
      simulatedProviders: harness?.simulatedCalls,
      stoppedCronJobs: harness?.stoppedCronJobs,
      results,
    });
    await harness?.close();
  });

  it('runs on the real composition with external providers simulated and cron stopped', () => {
    expect(harness.simulatedCalls).toContainEqual({ provider: 'firebase', method: 'onModuleInit' });
    expect(harness.stoppedCronJobs.length).toBeGreaterThan(0);
  });

  it('W01-TC04 login with a fixture actor, then GET /auth/me returns that actor', async () => {
    const token = await login('SUP_A1');
    const res = await http().get(url('/auth/me')).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({
      userSlug: 'e2e-sup-a1',
      phonenumber: harness.fixture.phonenumbers.SUP_A1,
      roleName: RoleEnum.Supervisor,
    });
    expect(res.body.result.scope).toContain(AuthorityCode.WarehouseRead);
    results['W01-TC04'] = {
      status: res.status,
      userSlug: res.body.result.userSlug,
      roleName: res.body.result.roleName,
    };
  });

  it('W01-TC05 anonymous calls to /auth/me and /warehouses get 401 without data', async () => {
    const me = await http().get(url('/auth/me'));
    const list = await http().get(url('/warehouses'));

    for (const res of [me, list]) {
      expect(res.status).toBe(401);
      expect(res.body.result).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('E2E-WH-');
    }
    results['W01-TC05'] = { me: me.status, warehouses: list.status };
  });

  it('W01-TC06 a SUPERVISOR-family role without WAREHOUSE_READ gets 403 on GET /warehouses', async () => {
    const { dataSource } = harness;
    const tc06Role = await dataSource.getRepository(Role).findOneByOrFail({ name: TC06_ROLE });
    const supervisor = await dataSource
      .getRepository(Role)
      .findOneByOrFail({ name: RoleEnum.Supervisor });
    const supervisorPermissionsBefore = await dataSource.query(
      'SELECT COUNT(*) AS n FROM permission_tbl WHERE role_id_column = ? AND deleted_at_column IS NULL',
      [supervisor.id],
    );

    try {
      await dataSource
        .getRepository(User)
        .update({ id: harness.fixture.ids.SUP_A_NO_EXPORT }, { role: tc06Role });
      await harness.clearRbacCache();
      const token = await login('SUP_A_NO_EXPORT');

      const me = await http().get(url('/auth/me')).set('Authorization', `Bearer ${token}`);
      expect(me.body.result.roleName).toBe(TC06_ROLE);
      expect(me.body.result.scope).not.toContain(AuthorityCode.WarehouseRead);

      const res = await http().get(url('/warehouses')).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.result).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('E2E-WH-');
      results['W01-TC06'] = { status: res.status, roleName: me.body.result.roleName };
    } finally {
      await harness.reseed();
    }

    const supervisorPermissionsAfter = await dataSource.query(
      'SELECT COUNT(*) AS n FROM permission_tbl WHERE role_id_column = ? AND deleted_at_column IS NULL',
      [supervisor.id],
    );
    expect(supervisorPermissionsAfter).toEqual(supervisorPermissionsBefore);
    const restored = await dataSource.getRepository(User).findOneOrFail({
      where: { id: harness.fixture.ids.SUP_A_NO_EXPORT },
      relations: { role: true },
    });
    expect(restored.role.name).toBe('E2E_SUPERVISOR_NO_EXPORT');
    expect(await dataSource.getRepository(Role).countBy({ name: In([RoleEnum.Supervisor]) })).toBe(
      1,
    );
  });

  it('W01-TC07 SUP_A1 lists only warehouse A and is denied warehouse B without leaking it', async () => {
    const token = await login('SUP_A1');
    const auth = { Authorization: `Bearer ${token}` };

    const list = await http().get(url('/warehouses')).query({ page: 1, size: 50 }).set(auth);
    expect(list.status).toBe(200);
    const slugs: string[] = list.body.result.items.map((item: { slug: string }) => item.slug);
    expect(slugs).toEqual([harness.fixture.warehouseSlugs.A]);

    const ownDetail = await http()
      .get(url(`/warehouses/${harness.fixture.warehouseSlugs.A}`))
      .set(auth);
    expect(ownDetail.status).toBe(200);

    const other = await http()
      .get(url(`/warehouses/${harness.fixture.warehouseSlugs.B}`))
      .set(auth);
    expect(other.status).toBe(403);
    expect(other.body.code).toBe(100523);
    expect(other.body.result).toBeUndefined();
    expect(JSON.stringify(other.body)).not.toContain('E2E-WH-B');

    results['W01-TC07'] = {
      listStatus: list.status,
      listedSlugs: slugs,
      ownDetailStatus: ownDetail.status,
      otherStatus: other.status,
      otherCode: other.body.code,
    };
  });
});
