import { randomBytes } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request, { Response } from 'supertest';
import { DataSource } from 'typeorm';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { CSRF_SECRET_MIN_LENGTH, OriginAllowlist } from 'src/grpc/gateway/auth/refresh-cookie';
import { createStorageAuthRuntime } from 'src/grpc/storage/auth/storage-auth.runtime';
import {
  RunningStorageGrpcServer,
  startStorageGrpcServer,
} from 'src/grpc/storage/storage-grpc.server';
import { GatewayConfig } from 'src/gateway/gateway.config';
import { configureGatewayApp, GatewayModule } from 'src/gateway/gateway.module';
import { AccessTokenService } from 'src/session/access-token.service';
import { TestPki } from '../grpc/test-pki';
import { closeDbHarness, createDbHarness } from '../harness/app';
import { writeEvidence } from '../harness/evidence';
import { SeededFixture, seedFixture } from '../harness/fixture';

/**
 * W02 I-02b — HTTP v1 THẬT: Gateway (composition root riêng `GatewayModule`, Express + supertest) → gRPC mTLS
 * loopback (cert test sinh lúc chạy) → Storage handler/SessionService thật → MySQL + Redis của target test
 * WH-TEST-ENV-20261105 (qua guard harness W01). Không mock guard/repository/gRPC. Đồng hồ `ManualClock` dùng
 * chung cho Gateway và Storage để kiểm 15'/30' không sleep.
 *
 * Mức bằng chứng: REAL_API_DB_REDIS_LOCALHOST_HTTP — HTTP thật nhưng là HTTP localhost (D14 mục 6: không phải
 * TLS PASS; cookie `Secure` được kiểm ở header, trình duyệt không tham gia). Origin trình duyệt và UI không chạy.
 */
jest.setTimeout(180_000);

const STORAGE_NAME = 'warehouse-storage';
const GATEWAY_NAME = 'warehouse-gateway';
const MINUTE = 60_000;
const REDIS_NAMESPACE = 'wh:preimpl:20261105:';
const ALLOWED_ORIGIN = 'https://wh.example.test';
const API = '/api/v1';
/** Tên cookie ở cấu hình Secure (review I-02b L2): refresh `__Secure-`, CSRF `__Host-`. */
const REFRESH = '__Secure-wh_refresh';
const CSRF = '__Host-wh_csrf';

class ManualClock {
  private current = new Date();
  now(): Date {
    return new Date(this.current.getTime());
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

interface ParsedCookie {
  value: string;
  attributes: string[];
}

function setCookies(response: Response): Record<string, ParsedCookie> {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookies: Record<string, ParsedCookie> = {};
  for (const line of header ?? []) {
    const [pair, ...attributes] = line.split(';').map((part) => part.trim());
    const separator = pair.indexOf('=');
    cookies[pair.slice(0, separator)] = { value: pair.slice(separator + 1), attributes };
  }
  return cookies;
}

interface Issued {
  access: string;
  refresh: string;
  csrf: string;
  sessionId: string;
  response: Response;
}

describe('W02 I-02b Gateway HTTP v1 → Storage gRPC (real DB + Redis + mTLS)', () => {
  let dataSource: DataSource;
  let targetId: string;
  let fixture: SeededFixture;
  let redis: Redis;
  let pki: TestPki;
  let storage: RunningStorageGrpcServer;
  let gateway: INestApplication;
  let clock: ManualClock;
  let rateLimitPrefix: string;
  let accessSecret: string;
  const storageErrors: string[] = [];
  let ipCounter = 0;
  const nextIp = () => `192.0.2.${(ipCounter += 1)}`;

  const http = () => request(gateway.getHttpServer());

  async function login(alias: keyof SeededFixture['ids'], ip = nextIp()): Promise<Issued> {
    const response = await http()
      .post(`${API}/auth/login`)
      .set('X-Forwarded-For', ip)
      .send({ phoneNumber: fixture.phonenumbers[alias], password: fixture.passwords[alias] });
    expect(response.status).toBe(200);
    const cookies = setCookies(response);
    return {
      access: response.body.result.accessToken,
      refresh: cookies[REFRESH].value,
      csrf: response.body.result.csrfToken,
      sessionId: response.body.result.sessionId,
      response,
    };
  }

  const refreshCall = (
    cookie: string | undefined,
    csrf: string | undefined,
    // `null` = không gửi header Origin (`undefined` sẽ kích hoạt giá trị mặc định).
    origin: string | null = ALLOWED_ORIGIN,
    ip = nextIp(),
  ) => {
    const headers: Record<string, string> = { 'X-Forwarded-For': ip };
    if (cookie !== undefined) headers.Cookie = `${REFRESH}=${cookie}`;
    if (csrf !== undefined) headers['X-CSRF-Token'] = csrf;
    if (origin !== null) headers.Origin = origin;
    return http().post(`${API}/auth/refresh`).set(headers);
  };

  const bearer = (access: string) => `Bearer ${access}`;

  const hashRows = (sessionId: string) =>
    dataSource.query(
      'SELECT h.used_at_column AS usedAt, h.current_family_id_column AS current FROM refresh_token_hash_tbl h JOIN refresh_token_family_tbl f ON f.id_column = h.family_id_column WHERE f.session_id_column = ? ORDER BY h.created_at_column',
      [sessionId],
    );

  function expectErrorEnvelope(response: Response, status: number, errorKey: string): void {
    expect(response.status).toBe(status);
    expect(Object.keys(response.body).sort()).toEqual(
      expect.arrayContaining(['code', 'errorKey', 'message', 'statusCode', 'timestamp', 'traceId']),
    );
    expect(response.body).toMatchObject({ statusCode: status, errorKey });
    expect(uuidValidate(response.body.traceId)).toBe(true);
  }

  beforeAll(async () => {
    const harness = await createDbHarness();
    dataSource = harness.dataSource;
    targetId = harness.target.id;
    fixture = await seedFixture(dataSource, Number(process.env.SALT_ROUNDS));
    redis = new Redis({
      host: harness.target.redis.host,
      port: harness.target.redis.port,
      lazyConnect: true,
    });
    await redis.connect();
    rateLimitPrefix = `${REDIS_NAMESPACE}i02b:${uuidv4()}:`;
    clock = new ManualClock();
    accessSecret = randomBytes(32).toString('hex');

    const runtime = await createStorageAuthRuntime({
      dataSource,
      redis,
      config: {
        accessTokenSecret: accessSecret,
        saltRounds: Number(process.env.SALT_ROUNDS),
        rateLimitPrefix,
      },
      clock,
      // Suite này không đổi quyền ⇒ không có cache legacy cần xoá; dùng chung client.
      legacyRbacRedis: redis,
      logError: (message) => storageErrors.push(message),
      logWarn: (message) => storageErrors.push(message),
    });

    pki = new TestPki();
    const ca = pki.createCa('wh-i02b-ca');
    const storageCert = pki.issue(ca, 'storage', STORAGE_NAME, 'serverAuth');
    const gatewayCert = pki.issue(ca, 'gateway', GATEWAY_NAME, 'clientAuth');
    storage = await startStorageGrpcServer(
      {
        bindAddress: '127.0.0.1:0',
        tls: { ca: ca.cert, cert: storageCert.cert, key: storageCert.key },
        allowedCallerIdentities: [GATEWAY_NAME],
      },
      runtime.handlers,
    );

    const config: GatewayConfig = {
      storage: {
        address: `127.0.0.1:${storage.port}`,
        serverName: STORAGE_NAME,
        tls: { ca: ca.cert, cert: gatewayCert.cert, key: gatewayCert.key },
        deadlineMs: 20_000,
      },
      accessTokenSecret: accessSecret,
      csrfSecret: randomBytes(CSRF_SECRET_MIN_LENGTH).toString('hex'),
      originAllowlist: new OriginAllowlist([ALLOWED_ORIGIN]),
      origins: [ALLOWED_ORIGIN],
      cookieSecure: true,
      // supertest đi từ 127.0.0.1 ⇒ tin X-Forwarded-For từ loopback để mỗi case có IP client riêng.
      trustProxy: 'loopback',
    };
    const moduleRef = await Test.createTestingModule({
      imports: [GatewayModule.forConfig(config, clock)],
    }).compile();
    gateway = moduleRef.createNestApplication({ logger: ['error'] });
    configureGatewayApp(gateway, config);
    await gateway.init();
  });

  afterAll(async () => {
    await gateway?.close();
    await storage?.shutdown();
    pki?.cleanup();
    if (redis) {
      const keys = await redis.keys(`${rateLimitPrefix}*`);
      if (keys.length) await redis.del(...keys);
      await redis.quit();
    }
    await closeDbHarness(dataSource);
  });

  afterEach(() => {
    expect(storageErrors).toEqual([]);
  });

  it('TC-ARC-03 (part) Gateway composition has no DataSource/repository', () => {
    expect(() => gateway.get(DataSource)).toThrow();
    writeEvidence('I02B-ARC-03', {
      case: 'TC-ARC-03 (part)',
      targetId,
      level: 'COMPONENT',
      gatewayHasDataSource: false,
    });
  });

  it('TC-AUTH-01 / TC-API-login: 200 envelope, access 15 min, refresh only in HttpOnly cookie', async () => {
    const issued = await login('SUP_A1');
    const { body } = issued.response;
    expect(Object.keys(body).sort()).toEqual(
      ['message', 'result', 'statusCode', 'timestamp', 'traceId'].sort(),
    );
    expect(uuidValidate(body.traceId)).toBe(true);
    expect(Object.keys(body.result).sort()).toEqual(
      ['accessToken', 'csrfToken', 'expiresIn', 'sessionId', 'user'].sort(),
    );
    expect(body.result.expiresIn).toBe(900);
    expect(body.result.user).toEqual({
      id: fixture.ids.SUP_A1,
      phoneNumber: fixture.phonenumbers.SUP_A1,
      isActive: true,
    });
    expect(JSON.stringify(body)).not.toContain(issued.refresh);
    expect(JSON.stringify(body)).not.toMatch(/refresh/i);

    const cookies = setCookies(issued.response);
    expect(cookies[REFRESH].value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookies[REFRESH].attributes).toEqual(
      expect.arrayContaining(['Path=/api/v1/auth', 'HttpOnly', 'SameSite=Lax', 'Secure']),
    );
    const maxAge = Number(
      cookies[REFRESH].attributes.find((a) => a.startsWith('Max-Age='))?.slice(8),
    );
    expect(maxAge).toBeGreaterThan(7 * 24 * 3600 - 60);
    expect(maxAge).toBeLessThanOrEqual(7 * 24 * 3600);
    // DEV-197-08: cookie CSRF `__Host-` đọc được bằng JS (không HttpOnly), Path=/, giá trị = csrfToken JSON.
    expect(cookies[CSRF].value).toBe(body.result.csrfToken);
    expect(cookies[CSRF].attributes).toEqual(
      expect.arrayContaining(['Path=/', 'SameSite=Lax', 'Secure']),
    );
    expect(cookies[CSRF].attributes).not.toContain('HttpOnly');
    const claims = JSON.parse(
      Buffer.from(body.result.accessToken.split('.')[1], 'base64url').toString('utf8'),
    );
    expect(claims.exp - claims.iat).toBe(900);

    writeEvidence('TC-AUTH-01-http', {
      case: 'TC-AUTH-01 / TC-API-login',
      level: 'REAL_API_DB_REDIS (localhost HTTP)',
      status: issued.response.status,
      resultKeys: Object.keys(body.result).sort(),
      refreshCookieAttributes: cookies[REFRESH].attributes,
      csrfCookieAttributes: cookies[CSRF].attributes,
      accessTtlSeconds: claims.exp - claims.iat,
      userFieldsReturned: Object.keys(body.result.user).sort(),
    });
  });

  it('TC-AUTH-02 wrong password and unknown phone: same 401 body, no cookie, no session', async () => {
    const ip = nextIp();
    const before = Number(
      (
        await dataSource.query(
          'SELECT COUNT(*) AS n FROM auth_session_tbl WHERE user_id_column = ?',
          [fixture.ids.SUP_A2],
        )
      )[0].n,
    );
    const wrong = await http()
      .post(`${API}/auth/login`)
      .set('X-Forwarded-For', ip)
      .send({ phoneNumber: fixture.phonenumbers.SUP_A2, password: 'wrong-password' });
    const unknown = await http()
      .post(`${API}/auth/login`)
      .set('X-Forwarded-For', ip)
      .send({ phoneNumber: '0999999999', password: 'wrong-password' });
    const strip = (response: Response) =>
      Object.fromEntries(
        Object.entries(response.body).filter(([key]) => key !== 'traceId' && key !== 'timestamp'),
      );
    expectErrorEnvelope(wrong, 401, 'SESSION_INVALID_CREDENTIALS');
    expect(strip(wrong)).toEqual(strip(unknown));
    expect(wrong.headers['set-cookie']).toBeUndefined();
    const after = Number(
      (
        await dataSource.query(
          'SELECT COUNT(*) AS n FROM auth_session_tbl WHERE user_id_column = ?',
          [fixture.ids.SUP_A2],
        )
      )[0].n,
    );
    expect(after).toBe(before);
    writeEvidence('TC-AUTH-02-http', {
      case: 'TC-AUTH-02',
      level: 'REAL_API_DB_REDIS (localhost HTTP)',
      body: strip(wrong),
      sameBody: true,
    });
  });

  it('TC-AUTH-04 refresh without/with wrong Origin or CSRF ⇒ 403 and no rotation', async () => {
    const issued = await login('MANAGER_A');
    const other = await login('MANAGER_A');
    const cases: Array<[string, Response]> = [
      ['no Origin', await refreshCall(issued.refresh, issued.csrf, null)],
      ['foreign Origin', await refreshCall(issued.refresh, issued.csrf, 'https://evil.example')],
      ['Origin null', await refreshCall(issued.refresh, issued.csrf, 'null')],
      ['no CSRF', await refreshCall(issued.refresh, undefined)],
      ['CSRF of another session', await refreshCall(issued.refresh, other.csrf)],
      ['short CSRF', await refreshCall(issued.refresh, 'x'.repeat(16))],
    ];
    const outcomes: Array<{ scenario: string; status: number; errorKey: string }> = [];
    for (const [scenario, response] of cases) {
      expect(response.status).toBe(403);
      expect(['GATEWAY_ORIGIN_REJECTED', 'GATEWAY_CSRF_INVALID']).toContain(response.body.errorKey);
      expect(response.body.result).toBeUndefined();
      expect(response.headers['set-cookie']).toBeUndefined();
      outcomes.push({ scenario, status: response.status, errorKey: response.body.errorKey });
    }
    // Không rotate: vẫn đúng 1 hash, chưa dùng, còn là hiện hành.
    const rows = await hashRows(issued.sessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].usedAt).toBeNull();
    expect(rows[0].current).not.toBeNull();

    // Đối chứng: cùng cookie + Origin đúng + CSRF đọc lại từ cookie `__Host-wh_csrf` (kịch bản reload) ⇒ 200, rotate.
    const csrfFromCookie = setCookies(issued.response)[CSRF].value;
    const ok = await refreshCall(issued.refresh, csrfFromCookie);
    expect(ok.status).toBe(200);
    expect(setCookies(ok)[REFRESH].value).not.toBe(issued.refresh);
    expect(ok.body.result.csrfToken).not.toBe(issued.csrf);
    expect(await hashRows(issued.sessionId)).toHaveLength(2);
    writeEvidence('TC-AUTH-04-http', {
      case: 'TC-AUTH-04',
      level: 'REAL_API_DB_REDIS (localhost HTTP)',
      outcomes,
      rotatedAfterRejections: false,
      validRefreshWithCsrfFromCookie: ok.status,
    });
  });

  it('TC-AUTH-05 / TC-API-refresh: reuse of a rotated cookie revokes the session and clears cookies', async () => {
    const issued = await login('SUP_A1');
    const rotated = await refreshCall(issued.refresh, issued.csrf);
    expect(rotated.status).toBe(200);
    expect(rotated.body.result.expiresIn).toBe(900);
    const next = setCookies(rotated);

    const reuse = await refreshCall(issued.refresh, issued.csrf);
    expectErrorEnvelope(reuse, 401, 'SESSION_REFRESH_TOKEN_REUSED');
    const cleared = setCookies(reuse);
    expect(cleared[REFRESH]).toMatchObject({ value: '' });
    expect(cleared[REFRESH].attributes).toContain('Max-Age=0');
    expect(cleared[CSRF].attributes).toContain('Max-Age=0');

    const afterReuse = await refreshCall(next[REFRESH].value, rotated.body.result.csrfToken);
    expectErrorEnvelope(afterReuse, 401, 'SESSION_REVOKED');
    const protectedCall = await http()
      .get(`${API}/sessions`)
      .set('Authorization', bearer(rotated.body.result.accessToken));
    expectErrorEnvelope(protectedCall, 401, 'SESSION_REVOKED');
    writeEvidence('TC-AUTH-05-http', {
      case: 'TC-AUTH-05 / TC-API-refresh',
      level: 'REAL_API_DB_REDIS (localhost HTTP)',
      reuse: reuse.body.errorKey,
      rotatedCookieAfterReuse: afterReuse.body.errorKey,
      protectedWithOldSession: protectedCall.body.errorKey,
      cookiesCleared: true,
    });
  });

  it('TC-AUTH-03 idle 30 min over HTTP: polling GET /sessions and refresh do not extend it', async () => {
    const issued = await login('MANAGER_C');
    clock.advance(14 * MINUTE);
    const r1 = await refreshCall(issued.refresh, issued.csrf);
    expect(r1.status).toBe(200);
    clock.advance(15 * MINUTE);
    const r2 = await refreshCall(setCookies(r1)[REFRESH].value, r1.body.result.csrfToken);
    expect(r2.status).toBe(200);
    const poll = await http()
      .get(`${API}/sessions`)
      .set('Authorization', bearer(r2.body.result.accessToken));
    expect(poll.status).toBe(200);
    clock.advance(MINUTE);
    const idle = await http()
      .get(`${API}/sessions`)
      .set('Authorization', bearer(r2.body.result.accessToken));
    expectErrorEnvelope(idle, 401, 'SESSION_IDLE_EXPIRED');
    const idleRefresh = await refreshCall(setCookies(r2)[REFRESH].value, r2.body.result.csrfToken);
    expectErrorEnvelope(idleRefresh, 401, 'SESSION_IDLE_EXPIRED');

    // Hoạt động tương tác thật (POST /auth/activity) mới gia hạn.
    const active = await login('MANAGER_C');
    clock.advance(10 * MINUTE); // access (15') còn hạn
    const activity = await http()
      .post(`${API}/auth/activity`)
      .set('Authorization', bearer(active.access));
    expect(activity.status).toBe(200);
    expect(activity.body.result).toMatchObject({
      id: active.sessionId,
      status: 'ACTIVITY_RECORDED',
      traceId: activity.body.traceId,
    });
    clock.advance(25 * MINUTE); // 35' sau login, 25' sau tương tác ⇒ chưa idle
    const stillActive = await refreshCall(active.refresh, active.csrf);
    expect(stillActive.status).toBe(200);
    writeEvidence('TC-AUTH-03-http', {
      case: 'TC-AUTH-03 / TC-API-recordInteractiveActivity',
      level: 'REAL_API_DB_REDIS (localhost HTTP)',
      clock: 'ManualClock shared by Gateway and Storage',
      idleAfterPollingAndRefresh: idle.body.errorKey,
      refreshOnIdle: idleRefresh.body.errorKey,
      activityExtendsIdle: stillActive.status === 200,
    });
  });

  it('TC-AUTH-06 / TC-API-logoutall: the other session is 401 on its next request; cookies cleared', async () => {
    const a = await login('MANAGER_AB');
    const b = await login('MANAGER_AB');
    const out = await http().post(`${API}/auth/logout-all`).set('Authorization', bearer(a.access));
    expect(out.status).toBe(200);
    expect(out.body.result).toMatchObject({ id: a.sessionId, status: 'REVOKED' });
    expect(Object.keys(out.body.result).sort()).toEqual(['id', 'status', 'traceId', 'version']);
    expect(out.body.result.version).toBeGreaterThanOrEqual(2);
    expect(setCookies(out)[REFRESH].attributes).toContain('Max-Age=0');
    const next = await http().get(`${API}/sessions`).set('Authorization', bearer(b.access));
    expectErrorEnvelope(next, 401, 'SESSION_REVOKED');
    const again = await http()
      .post(`${API}/auth/logout-all`)
      .set('Authorization', bearer(a.access));
    expectErrorEnvelope(again, 401, 'SESSION_REVOKED');
    writeEvidence('TC-AUTH-06-http', {
      case: 'TC-AUTH-06 / TC-API-logoutall',
      level: 'REAL_API_DB_REDIS (localhost HTTP)',
      otherSession: next.body.errorKey,
      repeatFromRevoked: again.body.errorKey,
    });
  });

  it('TC-AUTH-07 (own change) / TC-API-changeOwnPassword: 12..72 bytes at Gateway and Storage', async () => {
    const current = await login('SUP_A2');
    const other = await login('SUP_A2');
    const tooLong = await http()
      .post(`${API}/auth/change-password`)
      .set('Authorization', bearer(current.access))
      .send({ currentPassword: fixture.passwords.SUP_A2, newPassword: 'é'.repeat(37) });
    expectErrorEnvelope(tooLong, 422, 'GATEWAY_REQUEST_INVALID');
    expect(tooLong.body.errors).toEqual([
      {
        field: 'newPassword',
        errorKey: 'SESSION_NEW_PASSWORD_TOO_LONG',
        message: 'newPassword is invalid',
      },
    ]);
    const tooShort = await http()
      .post(`${API}/auth/change-password`)
      .set('Authorization', bearer(current.access))
      .send({ currentPassword: fixture.passwords.SUP_A2, newPassword: 'short' });
    expect(tooShort.body.errors[0].errorKey).toBe('SESSION_NEW_PASSWORD_TOO_SHORT');
    const wrongCurrent = await http()
      .post(`${API}/auth/change-password`)
      .set('Authorization', bearer(current.access))
      .send({ currentPassword: 'not-the-password', newPassword: 'a-new-password-1' });
    expectErrorEnvelope(wrongCurrent, 422, 'SESSION_CURRENT_PASSWORD_INCORRECT');

    const newPassword = `${'é'.repeat(30)}-new-pass`;
    const changed = await http()
      .post(`${API}/auth/change-password`)
      .set('Authorization', bearer(current.access))
      .send({ currentPassword: fixture.passwords.SUP_A2, newPassword });
    expect(changed.status).toBe(200);
    expect(changed.body.result).toMatchObject({
      id: current.sessionId,
      status: 'PASSWORD_CHANGED',
    });
    expectErrorEnvelope(
      await http().get(`${API}/sessions`).set('Authorization', bearer(other.access)),
      401,
      'SESSION_REVOKED',
    );
    const relogin = await http()
      .post(`${API}/auth/login`)
      .set('X-Forwarded-For', nextIp())
      .send({ phoneNumber: fixture.phonenumbers.SUP_A2, password: newPassword });
    expect(relogin.status).toBe(200);
    writeEvidence('TC-AUTH-07-own-http', {
      case: 'TC-AUTH-07 (changeOwnPassword part) / TC-API-changeOwnPassword',
      level: 'REAL_API_DB_REDIS (localhost HTTP)',
      tooLong: tooLong.body.errors,
      wrongCurrent: wrongCurrent.body.errorKey,
      otherSessionRevoked: true,
    });
  });

  it('TC-AUTH-08 the 21st login per IP+identifier is 429 over HTTP without a cookie or token', async () => {
    const ip = '198.51.100.121';
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const response = await http()
        .post(`${API}/auth/login`)
        .set('X-Forwarded-For', ip)
        .send({ phoneNumber: fixture.phonenumbers.SUP_B, password: 'nope' });
      expect(response.status).toBe(401);
    }
    const limited = await http()
      .post(`${API}/auth/login`)
      .set('X-Forwarded-For', ip)
      .send({ phoneNumber: fixture.phonenumbers.SUP_B, password: fixture.passwords.SUP_B });
    expectErrorEnvelope(limited, 429, 'SESSION_LOGIN_RATE_LIMITED');
    expect(limited.headers['set-cookie']).toBeUndefined();
    expect(limited.body.result).toBeUndefined();
    writeEvidence('TC-AUTH-08-http', {
      case: 'TC-AUTH-08',
      level: 'REAL_API_DB_REDIS (localhost HTTP)',
      attemptsBeforeLimit: 20,
      limited: limited.body.errorKey,
    });
  });

  it('TC-API lock / logout / listOwnSessions / revokeOwnSession (200 + schema)', async () => {
    const mine = await login('SUP_A_NO_EXPORT', '10.20.30.40');
    const second = await login('SUP_A_NO_EXPORT');
    const other = await login('ADMIN');

    const list = await http()
      .get(`${API}/sessions`)
      .query({ page: 1, pageSize: 100, sortBy: 'createdAt', sort: 'DESC' })
      .set('Authorization', bearer(mine.access));
    expect(list.status).toBe(200);
    expect(Object.keys(list.body.result).sort()).toEqual(
      ['hasNext', 'hasPrevious', 'items', 'page', 'pageSize', 'total', 'totalPages'].sort(),
    );
    expect(list.body.result).toMatchObject({ page: 1, pageSize: 100, hasPrevious: false });
    expect(typeof list.body.result.total).toBe('number');
    const current = list.body.result.items.find(
      (item: { id: string }) => item.id === mine.sessionId,
    );
    expect(current).toMatchObject({ isCurrent: true, ipMasked: '10.20.x.x' });
    for (const item of list.body.result.items)
      expect(
        Object.keys(item).every((key) =>
          [
            'id',
            'isCurrent',
            'createdAt',
            'lastInteractiveAt',
            'idleExpiresAt',
            'expiresAt',
            'ipMasked',
            'userAgent',
          ].includes(key),
        ),
      ).toBe(true);
    expect(list.body.result.items.map((item: { id: string }) => item.id)).not.toContain(
      other.sessionId,
    );

    const hidden = await http()
      .delete(`${API}/sessions/${other.sessionId}`)
      .set('Authorization', bearer(mine.access));
    expectErrorEnvelope(hidden, 404, 'SESSION_NOT_FOUND');
    const revoked = await http()
      .delete(`${API}/sessions/${second.sessionId}`)
      .set('Authorization', bearer(mine.access));
    expect(revoked.status).toBe(200);
    expect(revoked.body.result).toMatchObject({ id: second.sessionId, status: 'REVOKED' });

    const lock = await http().post(`${API}/auth/lock`).set('Authorization', bearer(mine.access));
    expect(lock.status).toBe(200);
    expect(lock.body.result).toMatchObject({ status: 'LOCKED' });
    expect(setCookies(lock)[REFRESH].attributes).toContain('Max-Age=0');
    expectErrorEnvelope(
      await http().get(`${API}/sessions`).set('Authorization', bearer(mine.access)),
      401,
      'SESSION_LOCKED',
    );

    const logout = await http()
      .post(`${API}/auth/logout`)
      .set('Authorization', bearer(other.access));
    const logoutAgain = await http()
      .post(`${API}/auth/logout`)
      .set('Authorization', bearer(other.access));
    expect(logout.status).toBe(200);
    expect(logoutAgain.status).toBe(200);
    expect(logoutAgain.body.result).toMatchObject({
      id: other.sessionId,
      status: 'REVOKED',
      version: logout.body.result.version,
    });
    writeEvidence('TC-API-session-ops-http', {
      case: 'TC-API-lock/logout/listOwnSessions/revokeOwnSession',
      level: 'REAL_API_DB_REDIS (localhost HTTP)',
      list: list.status,
      revokeOther: hidden.body.errorKey,
      revokeOwn: revoked.status,
      lock: lock.status,
      logoutIdempotent: logoutAgain.status,
    });
  });

  it('TC-DENY (7 AUTHENTICATED ops) over HTTP: no token, malformed, foreign-secret, dead-session token', async () => {
    const foreign = new AccessTokenService('f'.repeat(48), clock).sign({
      sub: fixture.ids.SUP_A1,
      sid: uuidv4(),
    }).token;
    const dead = await login('SUP_A1');
    await http().post(`${API}/auth/logout`).set('Authorization', bearer(dead.access));
    const routes: Array<[string, 'post' | 'get' | 'delete', string, object | undefined]> = [
      ['logout', 'post', '/auth/logout', undefined],
      ['logoutall', 'post', '/auth/logout-all', undefined],
      ['lock', 'post', '/auth/lock', undefined],
      [
        'changeOwnPassword',
        'post',
        '/auth/change-password',
        { currentPassword: 'x', newPassword: 'y'.repeat(12) },
      ],
      ['recordInteractiveActivity', 'post', '/auth/activity', undefined],
      ['listOwnSessions', 'get', '/sessions', undefined],
      ['revokeOwnSession', 'delete', `/sessions/${uuidv4()}`, undefined],
    ];
    const outcomes: Array<{ operation: string; errorKeys: string[] }> = [];
    for (const [operation, method, path, body] of routes) {
      const send = (authorization?: string) => {
        const headers: Record<string, string> =
          authorization === undefined ? {} : { Authorization: authorization };
        const call = http()[method](`${API}${path}`).set(headers);
        return body ? call.send(body) : call;
      };
      const missing = await send();
      const malformed = await send(`Bearer  ${dead.access}`);
      const wrongSecret = await send(bearer(foreign));
      expectErrorEnvelope(missing, 401, 'SESSION_ACCESS_TOKEN_MISSING');
      expectErrorEnvelope(malformed, 401, 'SESSION_ACCESS_TOKEN_INVALID');
      expectErrorEnvelope(wrongSecret, 401, 'SESSION_ACCESS_TOKEN_INVALID');
      const keys = [missing.body.errorKey, malformed.body.errorKey, wrongSecret.body.errorKey];
      if (operation !== 'logout') {
        const deadSession = await send(bearer(dead.access));
        expectErrorEnvelope(deadSession, 401, 'SESSION_REVOKED');
        keys.push(deadSession.body.errorKey);
      }
      outcomes.push({ operation, errorKeys: keys });
    }
    writeEvidence('TC-DENY-session-http', {
      case: 'TC-DENY-<op> for 7 AUTHENTICATED ops (401; no authority code ⇒ no 403 branch)',
      level: 'REAL_API_DB_REDIS (localhost HTTP)',
      outcomes,
    });
  });

  it('protocol: unknown property 422, malformed JSON 400, bad UUID 422, unsupported sortBy 422, getProfile 404', async () => {
    const issued = await login('SUP_B');
    const extra = await http()
      .post(`${API}/auth/login`)
      .set('X-Forwarded-For', nextIp())
      .send({ phoneNumber: fixture.phonenumbers.SUP_B, password: 'x', role: 'ADMIN' });
    expectErrorEnvelope(extra, 422, 'GATEWAY_REQUEST_INVALID');
    expect(extra.body.errors).toEqual([
      {
        field: 'role',
        errorKey: 'GATEWAY_PROPERTY_NOT_ALLOWED',
        message: 'Property is not allowed',
      },
    ]);
    const malformed = await http()
      .post(`${API}/auth/login`)
      .set('Content-Type', 'application/json')
      .send('{"phoneNumber":');
    expectErrorEnvelope(malformed, 400, 'GATEWAY_PAYLOAD_INVALID');
    const badId = await http()
      .delete(`${API}/sessions/not-a-uuid`)
      .set('Authorization', bearer(issued.access));
    expectErrorEnvelope(badId, 422, 'GATEWAY_REQUEST_INVALID');
    const sortByName = await http()
      .get(`${API}/sessions`)
      .query({ sortBy: 'name' })
      .set('Authorization', bearer(issued.access));
    expectErrorEnvelope(sortByName, 422, 'SESSION_REQUEST_INVALID');
    expect(sortByName.body.errors[0]).toMatchObject({
      field: 'sortBy',
      errorKey: 'SESSION_SORT_BY_UNSUPPORTED',
    });
    const badPageSize = await http()
      .get(`${API}/sessions`)
      .query({ pageSize: 101 })
      .set('Authorization', bearer(issued.access));
    expectErrorEnvelope(badPageSize, 422, 'GATEWAY_REQUEST_INVALID');
    const profile = await http().get(`${API}/auth/me`).set('Authorization', bearer(issued.access));
    expectErrorEnvelope(profile, 404, 'GATEWAY_ROUTE_NOT_FOUND');
    writeEvidence('I02B-protocol-http', {
      case: 'protocol errors + getProfile/updateProfile not exposed',
      level: 'REAL_API (localhost HTTP)',
      unknownProperty: extra.status,
      malformedJson: malformed.status,
      badUuid: badId.status,
      sortByName: sortByName.body.errors,
      getProfile: profile.status,
    });
  });

  it('L2 (review I-02b) cookie tossing: unprefixed cookie ignored, duplicate prefixed cookie rejected, no rotation', async () => {
    const victim = await login('SUP_A1');
    // SUP_A2 đã đổi mật khẩu ở case TC-AUTH-07 ⇒ dùng actor khác.
    const attacker = await login('MANAGER_A');
    // (a) Cookie không tiền tố (kiểu subdomain/HTTP đặt) — dù là token hợp lệ + CSRF đúng — bị bỏ qua.
    const unprefixed = await http()
      .post(`${API}/auth/refresh`)
      .set({
        'X-Forwarded-For': nextIp(),
        Origin: ALLOWED_ORIGIN,
        Cookie: `wh_refresh=${attacker.refresh}`,
        'X-CSRF-Token': attacker.csrf,
      });
    expectErrorEnvelope(unprefixed, 401, 'GATEWAY_REFRESH_COOKIE_MISSING');
    // (b) 2 cookie `__Secure-wh_refresh` (host-only của nạn nhân + Domain=parent của kẻ tấn công) ⇒ từ chối,
    // xoá mọi biến thể host-only, không rotate token nào.
    const tossed = await http()
      .post(`${API}/auth/refresh`)
      .set({
        'X-Forwarded-For': nextIp(),
        Origin: ALLOWED_ORIGIN,
        Cookie: `${REFRESH}=${victim.refresh}; ${REFRESH}=${attacker.refresh}`,
        'X-CSRF-Token': attacker.csrf,
      });
    expectErrorEnvelope(tossed, 401, 'GATEWAY_REFRESH_COOKIE_CONFLICT');
    const cleared = setCookies(tossed);
    expect(Object.keys(cleared).sort()).toEqual([CSRF, REFRESH, 'wh_csrf', 'wh_refresh'].sort());
    for (const cookie of Object.values(cleared)) expect(cookie.attributes).toContain('Max-Age=0');
    for (const sessionId of [victim.sessionId, attacker.sessionId]) {
      const rows = await hashRows(sessionId);
      expect(rows).toHaveLength(1);
      expect(rows[0].usedAt).toBeNull();
    }
    // Cookie CSRF luôn là `__Host-` (subdomain không đặt được) ⇒ FE không đọc được CSRF do kẻ khác cài.
    expect(setCookies(victim.response)[CSRF]).toBeDefined();
    expect(setCookies(victim.response).wh_csrf).toBeUndefined();
    writeEvidence('I02B-R2-L2-cookie-tossing', {
      case: 'review I-02b L2',
      level: 'REAL_API_DB_REDIS (localhost HTTP)',
      unprefixedCookie: unprefixed.body.errorKey,
      duplicatePrefixedCookie: tossed.body.errorKey,
      clearedVariants: Object.keys(cleared).sort(),
      rotated: false,
    });
  });

  it('Gateway throttles refresh per IP (60/min) before any RPC', async () => {
    const ip = '198.51.100.200';
    const statuses: number[] = [];
    for (let attempt = 1; attempt <= 61; attempt += 1)
      statuses.push((await refreshCall(undefined, undefined, ALLOWED_ORIGIN, ip)).status);
    expect(statuses.slice(0, 60).every((status) => status === 401)).toBe(true);
    expect(statuses[60]).toBe(429);
    const limited = await refreshCall(undefined, undefined, ALLOWED_ORIGIN, ip);
    expectErrorEnvelope(limited, 429, 'GATEWAY_RATE_LIMITED');
    writeEvidence('I02B-refresh-ip-throttle', {
      case: 'refresh throttle per IP (DEV-197-16)',
      level: 'REAL_API (localhost HTTP)',
      limitPerMinute: 60,
      status61: statuses[60],
    });
  });
});
