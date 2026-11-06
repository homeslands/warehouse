import request from 'supertest';
import { createHarness, Harness } from '../harness/app';
import { writeEvidence } from '../harness/evidence';

/**
 * F-196-01 trên route LEGACY (W02 I-03a): `GET /authorities` và `GET /authority-groups` giờ cần
 * MANAGE_PERMISSIONS (trước chỉ JWT). AppModule legacy thật (guard, MySQL, Redis) qua harness W01; actor fixture
 * thật, không SUPER_ADMIN. FE chỉ gọi `/authorities` từ màn `/permissions` (đã gác MANAGE_PERMISSIONS).
 */
jest.setTimeout(120_000);

describe('F-196-01 legacy authority routes require MANAGE_PERMISSIONS', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness?.close();
  });

  async function token(alias: 'ADMIN' | 'MANAGER_A' | 'SUP_A1'): Promise<string> {
    const response = await request(harness.app.getHttpServer())
      .post(`${harness.prefix}/auth/login`)
      .send({
        phonenumber: harness.fixture.phonenumbers[alias],
        password: harness.fixture.passwords[alias],
      });
    expect(response.status).toBe(200);
    return response.body.result.accessToken;
  }

  it('ADMIN 200; MANAGER_A and SUP_A1 403; anonymous 401', async () => {
    const outcomes: Array<{ path: string; actor: string; status: number }> = [];
    const actors = {
      ADMIN: await token('ADMIN'),
      MANAGER_A: await token('MANAGER_A'),
      SUP_A1: await token('SUP_A1'),
    };
    for (const path of ['/authorities', '/authority-groups']) {
      const call = (bearer?: string) => {
        const test = request(harness.app.getHttpServer()).get(`${harness.prefix}${path}`);
        return bearer ? test.set({ Authorization: `Bearer ${bearer}` }) : test;
      };
      const anonymous = await call();
      expect(anonymous.status).toBe(401);
      outcomes.push({ path, actor: 'ANONYMOUS', status: anonymous.status });
      for (const [actor, bearer] of Object.entries(actors)) {
        const response = await call(bearer);
        expect(response.status).toBe(actor === 'ADMIN' ? 200 : 403);
        outcomes.push({ path, actor, status: response.status });
      }
    }
    writeEvidence('F-196-01-legacy', {
      case: 'F-196-01 (legacy routes)',
      level: 'REAL_API_DB_REDIS (legacy AppModule)',
      outcomes,
    });
  });
});
