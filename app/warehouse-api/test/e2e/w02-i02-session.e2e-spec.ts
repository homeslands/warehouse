import { randomBytes } from 'crypto';
import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { StorageGrpcClient } from 'src/grpc/gateway/storage-grpc.client';
import { StorageRpcError } from 'src/grpc/gateway/storage-rpc.error';
import { translateStorageRpcError } from 'src/grpc/gateway/storage-rpc-error.translator';
import { REFRESH_TOKEN_METADATA_KEY } from 'src/grpc/grpc.constants';
import { createStorageAuthHandlers } from 'src/grpc/storage/auth/storage-auth.handlers';
import {
  RunningStorageGrpcServer,
  startStorageGrpcServer,
} from 'src/grpc/storage/storage-grpc.server';
import { AccessTokenService } from 'src/session/access-token.service';
import { RedisFixedWindowRateLimiter } from 'src/session/rate-limiter';
import { hashRefreshToken } from 'src/session/session.policy';
import { SessionService } from 'src/session/session.service';
import { TestPki } from '../grpc/test-pki';
import { closeDbHarness, createDbHarness } from '../harness/app';
import { MigrationRecord } from '../harness/datasource';
import { writeEvidence } from '../harness/evidence';
import { SeededFixture, seedFixture } from '../harness/fixture';

/**
 * W02 I-02a trên target test thật (WH-TEST-ENV-20261105, qua guard harness W01): MySQL + Redis thật,
 * Storage gRPC server + Gateway client grpc-js thật qua mTLS loopback (cert test sinh lúc chạy), handler và
 * SessionService thật — không mock repository/guard. Đồng hồ là `ManualClock` inject vào service để kiểm idle
 * 30 phút / access 15 phút mà không sleep.
 *
 * Mức bằng chứng: REAL_RPC_DB_REDIS (Storage RPC). Lớp HTTP Gateway v1 (cookie, CSRF/Origin, envelope qua
 * controller) CHƯA có (I-02b) ⇒ các case cần HTTP thật ghi NOT_RUN ở handoff, không suy ra từ đây.
 */
jest.setTimeout(120_000);

const STORAGE_NAME = 'warehouse-storage';
const GATEWAY_NAME = 'warehouse-gateway';
const MINUTE = 60_000;
/** Namespace Redis của target (`target.json` → redis.namespace) + run id ⇒ không đụng key khác. */
const REDIS_NAMESPACE = 'wh:preimpl:20261105:';
const MIGRATION_NAME = 'CreateSessionTables1783728000048';

class ManualClock {
  private current = new Date();
  now(): Date {
    return new Date(this.current.getTime());
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

interface LoginRpcResult {
  accessToken: string;
  sessionId: string;
  user: Record<string, unknown>;
}
interface RpcEnvelope<T> {
  result: T;
  meta: { traceId: string; timestamp: string };
}
interface IssuedPair {
  access: string;
  refresh: string;
  sessionId: string;
  result: LoginRpcResult;
}

describe('W02 I-02a session over Storage RPC (real DB + Redis + mTLS)', () => {
  let dataSource: DataSource;
  let migrations: { applied: string[]; history: MigrationRecord[] };
  let targetId: string;
  let fixture: SeededFixture;
  let redis: Redis;
  let pki: TestPki;
  let server: RunningStorageGrpcServer;
  let client: StorageGrpcClient;
  let clock: ManualClock;
  let rateLimitPrefix: string;
  const loggedErrors: string[] = [];
  let ipCounter = 0;

  /** Mỗi login dùng IP riêng (TEST-NET-3) để bộ đếm IP+identifier của case này không ảnh hưởng case khác. */
  const nextIp = () => `203.0.113.${(ipCounter += 1)}`;

  async function call<T>(
    rpc: string,
    request: object,
    options: { access?: string; ip?: string; authorization?: string } = {},
  ): Promise<{ response: RpcEnvelope<T>; headers: Metadata }> {
    return client.unaryWithHeaders<RpcEnvelope<T>>(rpc, request, {
      traceId: uuidv4(),
      authorization:
        options.authorization ?? (options.access ? `Bearer ${options.access}` : undefined),
      client: { ip: options.ip ?? nextIp(), userAgent: 'e2e-agent/1.0 (I-02)' },
    });
  }

  /** Lỗi RPC → envelope v1 qua translator thật của Gateway. */
  async function failure(promise: Promise<unknown>) {
    const error = await promise.then(
      () => {
        throw new Error('expected the RPC to fail');
      },
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(StorageRpcError);
    const translated = translateStorageRpcError(error as StorageRpcError);
    return {
      grpc: (error as StorageRpcError).grpcCode,
      status: translated.statusCode,
      errorKey: translated.body.errorKey,
      code: translated.body.code,
      message: translated.body.message,
      fieldKeys: (translated.body.errors ?? []).map((item) => `${item.field}:${item.errorKey}`),
    };
  }

  function refreshTokenOf(headers: Metadata): string {
    const values = headers.get(REFRESH_TOKEN_METADATA_KEY);
    expect(values).toHaveLength(1);
    return values[0] as string;
  }

  async function login(alias: keyof SeededFixture['ids'] = 'SUP_A1', ip = nextIp()) {
    const { response, headers } = await call<LoginRpcResult>(
      'Login',
      { data: { phoneNumber: fixture.phonenumbers[alias], password: fixture.passwords[alias] } },
      { ip },
    );
    return {
      access: response.result.accessToken,
      refresh: refreshTokenOf(headers),
      sessionId: response.result.sessionId,
      result: response.result,
    } as IssuedPair;
  }

  async function refresh(token: string) {
    const { response, headers } = await call<LoginRpcResult>('Refresh', {
      refreshCookieToken: token,
    });
    return { access: response.result.accessToken, refresh: refreshTokenOf(headers) };
  }

  const sessionRow = async (id: string) =>
    (
      await dataSource.query(
        'SELECT revoked_at_column AS revokedAt, revoke_reason_column AS reason, locked_at_column AS lockedAt, last_interactive_at_column AS lastInteractiveAt, idle_expires_at_column AS idleExpiresAt, version_column AS version, ip_address_column AS ip FROM auth_session_tbl WHERE id_column = ?',
        [id],
      )
    )[0];
  const countSessions = async (userId: string) =>
    Number(
      (
        await dataSource.query(
          'SELECT COUNT(*) AS n FROM auth_session_tbl WHERE user_id_column = ?',
          [userId],
        )
      )[0].n,
    );
  const countFamilies = async () =>
    Number((await dataSource.query('SELECT COUNT(*) AS n FROM refresh_token_family_tbl'))[0].n);

  beforeAll(async () => {
    const harness = await createDbHarness();
    dataSource = harness.dataSource;
    migrations = harness.migrations;
    targetId = harness.target.id;
    fixture = await seedFixture(dataSource, Number(process.env.SALT_ROUNDS));

    redis = new Redis({
      host: harness.target.redis.host,
      port: harness.target.redis.port,
      lazyConnect: true,
    });
    await redis.connect();
    rateLimitPrefix = `${REDIS_NAMESPACE}i02:${uuidv4()}:`;

    clock = new ManualClock();
    const sessions = new SessionService({
      dataSource,
      tokens: new AccessTokenService(randomBytes(32).toString('hex'), clock),
      rateLimiter: new RedisFixedWindowRateLimiter(redis, rateLimitPrefix),
      clock,
      saltRounds: Number(process.env.SALT_ROUNDS),
    });

    pki = new TestPki();
    const ca = pki.createCa('wh-i02-ca');
    const storageCert = pki.issue(ca, 'storage', STORAGE_NAME, 'serverAuth');
    const gatewayCert = pki.issue(ca, 'gateway', GATEWAY_NAME, 'clientAuth');
    server = await startStorageGrpcServer(
      {
        bindAddress: '127.0.0.1:0',
        tls: { ca: ca.cert, cert: storageCert.cert, key: storageCert.key },
        allowedCallerIdentities: [GATEWAY_NAME],
      },
      createStorageAuthHandlers({
        sessions,
        clock,
        logError: (message) => loggedErrors.push(message),
      }),
    );
    client = new StorageGrpcClient({
      address: `127.0.0.1:${server.port}`,
      serverName: STORAGE_NAME,
      tls: { ca: ca.cert, cert: gatewayCert.cert, key: gatewayCert.key },
      deadlineMs: 20_000,
    });
  });

  afterAll(async () => {
    client?.close();
    await server?.shutdown();
    pki?.cleanup();
    if (redis) {
      const keys = await redis.keys(`${rateLimitPrefix}*`);
      if (keys.length) await redis.del(...keys);
      await redis.quit();
    }
    await closeDbHarness(dataSource);
  });

  afterEach(() => {
    // Lỗi không lường trước ở handler (INTERNAL) là FAIL của case, không được nuốt.
    expect(loggedErrors).toEqual([]);
  });

  it('I02-MIG migration 1783728000048: applied, hash-only schema, FK collation from parent, down → up', async () => {
    const last = migrations.history[migrations.history.length - 1];
    expect(last.name).toBe(MIGRATION_NAME);
    const tableNames = async () =>
      (
        await dataSource.query(
          "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('auth_session_tbl','refresh_token_family_tbl','refresh_token_hash_tbl') ORDER BY TABLE_NAME",
        )
      ).map((row: { t: string }) => row.t);
    expect(await tableNames()).toEqual([
      'auth_session_tbl',
      'refresh_token_family_tbl',
      'refresh_token_hash_tbl',
    ]);
    // Bảng `session_tbl` của express-mysql-session (legacy) không bị migration này đụng tới.

    // Down rồi up lại qua đúng cơ chế TypeORM (cập nhật bảng `migrations`) — chỉ ở phase expand, DB test riêng.
    await dataSource.undoLastMigration({ transaction: 'each' });
    expect(await tableNames()).toEqual([]);
    const afterDown: MigrationRecord[] = await dataSource.query(
      'SELECT `timestamp`, `name` FROM `migrations` ORDER BY `timestamp` DESC LIMIT 1',
    );
    expect(afterDown[0].name).not.toBe(MIGRATION_NAME);
    const reapplied = await dataSource.runMigrations({ transaction: 'each' });
    expect(reapplied.map((migration) => migration.name)).toEqual([MIGRATION_NAME]);
    expect(await tableNames()).toHaveLength(3);

    const columns: Array<{
      table: string;
      column: string;
      charset: string | null;
      collation: string | null;
    }> = await dataSource.query(
      "SELECT TABLE_NAME AS `table`, COLUMN_NAME AS `column`, CHARACTER_SET_NAME AS charset, COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND ((TABLE_NAME = 'user_tbl' AND COLUMN_NAME = 'id_column') OR TABLE_NAME = 'refresh_token_hash_tbl' OR (TABLE_NAME = 'auth_session_tbl' AND COLUMN_NAME = 'user_id_column'))",
    );
    const parent = columns.find((c) => c.table === 'user_tbl');
    const child = columns.find((c) => c.table === 'auth_session_tbl');
    expect(child?.collation).toBe(parent?.collation);
    expect(child?.charset).toBe(parent?.charset);
    const hashColumns = columns
      .filter((c) => c.table === 'refresh_token_hash_tbl')
      .map((c) => c.column);
    expect(hashColumns.sort()).toEqual(
      [
        'created_at_column',
        'current_family_id_column',
        'expires_at_column',
        'family_id_column',
        'id_column',
        'token_hash_column',
        'used_at_column',
      ].sort(),
    );
    const uniques: Array<{ name: string }> = await dataSource.query(
      "SELECT DISTINCT INDEX_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0 AND TABLE_NAME IN ('refresh_token_hash_tbl','refresh_token_family_tbl') ORDER BY name",
    );
    expect(uniques.map((u) => u.name)).toEqual(
      expect.arrayContaining([
        'UQ_refresh_token_hash',
        'UQ_refresh_token_current_per_family',
        'UQ_refresh_token_family_session',
      ]),
    );

    writeEvidence('I02-MIG', {
      case: 'I02-MIG',
      level: 'REAL_DB',
      targetId,
      appliedThisRun: migrations.applied,
      lastMigration: last,
      downThenUp: { afterDownLast: afterDown[0], reapplied: reapplied.map((m) => m.name) },
      fkCollation: { parent, child },
      hashTableColumns: hashColumns,
    });
  });

  it('TC-AUTH-01 (RPC part) login: access 15 min, refresh only in metadata, DB keeps only its SHA-256', async () => {
    const before = await countSessions(fixture.ids.SUP_A1);
    const issued = await login('SUP_A1', '192.0.2.44');
    expect(issued.result).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(issued.result)).not.toContain(issued.refresh);
    expect(issued.refresh).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // `arrays: true` của proto-loader thêm `warehouseIds: []`/`highlights: []`; mapping `User` v1 đủ field là I-02b.
    expect(issued.result.user).toMatchObject({
      id: fixture.ids.SUP_A1,
      phoneNumber: fixture.phonenumbers.SUP_A1,
      isActive: true,
    });
    const [, payload] = issued.access.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    expect(claims.exp - claims.iat).toBe(900);
    expect(claims).toMatchObject({ sub: fixture.ids.SUP_A1, sid: issued.sessionId });
    expect(await countSessions(fixture.ids.SUP_A1)).toBe(before + 1);

    const rows = await dataSource.query(
      'SELECT h.token_hash_column AS hash, h.current_family_id_column AS current FROM refresh_token_hash_tbl h JOIN refresh_token_family_tbl f ON f.id_column = h.family_id_column WHERE f.session_id_column = ?',
      [issued.sessionId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].hash).toBe(hashRefreshToken(issued.refresh));
    const dump = JSON.stringify(
      await dataSource.query(
        'SELECT * FROM auth_session_tbl s JOIN refresh_token_family_tbl f ON f.session_id_column = s.id_column JOIN refresh_token_hash_tbl h ON h.family_id_column = f.id_column WHERE s.id_column = ?',
        [issued.sessionId],
      ),
    );
    expect(dump).not.toContain(issued.refresh);
    expect((await sessionRow(issued.sessionId)).ip).toBe('192.0.2.44');

    writeEvidence('TC-AUTH-01-rpc', {
      case: 'TC-AUTH-01',
      level: 'REAL_RPC_DB_REDIS',
      scope: 'Storage Login RPC; HTTP cookie flags NOT_RUN (Gateway v1 is I-02b)',
      accessTtlSeconds: claims.exp - claims.iat,
      refreshInJson: false,
      storedAsSha256Only: true,
    });
  });

  it('TC-AUTH-02 wrong password and unknown phone give the same 401 and create no session', async () => {
    const before = await countSessions(fixture.ids.SUP_A2);
    const wrong = await failure(
      call('Login', {
        data: { phoneNumber: fixture.phonenumbers.SUP_A2, password: 'wrong-password' },
      }),
    );
    const unknown = await failure(
      call('Login', { data: { phoneNumber: '0999999999', password: 'wrong-password' } }),
    );
    expect(wrong).toEqual(unknown);
    expect(wrong).toMatchObject({
      grpc: GrpcStatus.UNAUTHENTICATED,
      status: 401,
      errorKey: 'SESSION_INVALID_CREDENTIALS',
      code: 118201,
    });
    expect(await countSessions(fixture.ids.SUP_A2)).toBe(before);
    writeEvidence('TC-AUTH-02-rpc', {
      case: 'TC-AUTH-02',
      level: 'REAL_RPC_DB_REDIS',
      wrong,
      unknown,
    });
  });

  it('TC-AUTH-08 the 21st login per IP+identifier within a minute is 429 without a token or existence leak', async () => {
    const ip = '198.51.100.21';
    const before = await countSessions(fixture.ids.SUP_B);
    for (let attempt = 1; attempt <= 20; attempt += 1)
      expect(
        await failure(
          call(
            'Login',
            { data: { phoneNumber: fixture.phonenumbers.SUP_B, password: 'nope' } },
            { ip },
          ),
        ),
      ).toMatchObject({ status: 401 });
    // Lần 21 với ĐÚNG mật khẩu vẫn bị chặn trước khi kiểm DB ⇒ không có token.
    const limited = await failure(
      call(
        'Login',
        { data: { phoneNumber: fixture.phonenumbers.SUP_B, password: fixture.passwords.SUP_B } },
        { ip },
      ),
    );
    expect(limited).toMatchObject({
      grpc: GrpcStatus.RESOURCE_EXHAUSTED,
      status: 429,
      errorKey: 'SESSION_LOGIN_RATE_LIMITED',
    });
    expect(await countSessions(fixture.ids.SUP_B)).toBe(before);

    // Identifier không tồn tại cũng bị 429 cùng nội dung sau 20 lần ⇒ không lộ tồn tại.
    for (let attempt = 1; attempt <= 20; attempt += 1)
      await failure(
        call('Login', { data: { phoneNumber: '0988888888', password: 'nope' } }, { ip }),
      );
    const unknownLimited = await failure(
      call('Login', { data: { phoneNumber: '0988888888', password: 'nope' } }, { ip }),
    );
    expect(unknownLimited).toEqual(limited);

    // Khoá theo IP + identifier: cùng identifier từ IP khác vẫn đăng nhập được.
    const other = await login('SUP_B', '198.51.100.22');
    expect(other.sessionId).toBeDefined();
    writeEvidence('TC-AUTH-08-rpc', {
      case: 'TC-AUTH-08',
      level: 'REAL_RPC_DB_REDIS',
      attemptsBeforeLimit: 20,
      limited,
      unknownLimitedSame: true,
      otherIpAllowed: true,
    });
  });

  it('TC-AUTH-05 reuse of a rotated refresh token revokes the family and the session', async () => {
    const first = await login('SUP_A1');
    const rotated = await refresh(first.refresh);
    expect(rotated.refresh).not.toBe(first.refresh);

    const reuse = await failure(call('Refresh', { refreshCookieToken: first.refresh }));
    expect(reuse).toMatchObject({ status: 401, errorKey: 'SESSION_REFRESH_TOKEN_REUSED' });
    expect(await sessionRow(first.sessionId)).toMatchObject({ reason: 'REFRESH_TOKEN_REUSE' });

    // Token mới của cùng family và access của phiên cũ đều hết hiệu lực.
    expect(await failure(call('Refresh', { refreshCookieToken: rotated.refresh }))).toMatchObject({
      status: 401,
      errorKey: 'SESSION_REVOKED',
    });
    expect(await failure(call('ListOwnSessions', {}, { access: rotated.access }))).toMatchObject({
      status: 401,
      errorKey: 'SESSION_REVOKED',
    });

    const currents = await dataSource.query(
      'SELECT COUNT(*) AS n FROM refresh_token_hash_tbl h JOIN refresh_token_family_tbl f ON f.id_column = h.family_id_column WHERE f.session_id_column = ? AND h.current_family_id_column IS NOT NULL',
      [first.sessionId],
    );
    expect(Number(currents[0].n)).toBe(1);
    writeEvidence('TC-AUTH-05-rpc', { case: 'TC-AUTH-05', level: 'REAL_RPC_DB_REDIS', reuse });
  });

  it('TC-AUTH-05 race: two concurrent refreshes with the same token ⇒ one rotation, one reuse revoke', async () => {
    const issued = await login('SUP_A2');
    const results = await Promise.allSettled([
      call('Refresh', { refreshCookieToken: issued.refresh }),
      call('Refresh', { refreshCookieToken: issued.refresh }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(translateStorageRpcError(rejected.reason as StorageRpcError).body.errorKey).toBe(
      'SESSION_REFRESH_TOKEN_REUSED',
    );
    expect(await sessionRow(issued.sessionId)).toMatchObject({ reason: 'REFRESH_TOKEN_REUSE' });
  });

  it('TC-AUTH-03 idle 30 min is enforced server-side; polling and refresh do not extend it', async () => {
    const issued = await login('MANAGER_A');
    const start = await sessionRow(issued.sessionId);
    const familiesBefore = await countFamilies();
    const sessionsBefore = await countSessions(fixture.ids.MANAGER_A);

    clock.advance(14 * MINUTE);
    const r1 = await refresh(issued.refresh);
    await call('ListOwnSessions', {}, { access: r1.access });
    clock.advance(15 * MINUTE);
    const r2 = await refresh(r1.refresh);
    await call('ListOwnSessions', {}, { access: r2.access });
    const polled = await sessionRow(issued.sessionId);
    expect(polled.lastInteractiveAt).toEqual(start.lastInteractiveAt);
    expect(polled.idleExpiresAt).toEqual(start.idleExpiresAt);

    clock.advance(MINUTE); // = 30 phút kể từ login, chỉ có polling/refresh.
    const idle = await failure(call('ListOwnSessions', {}, { access: r2.access }));
    expect(idle).toMatchObject({ status: 401, errorKey: 'SESSION_IDLE_EXPIRED' });
    expect(await failure(call('Refresh', { refreshCookieToken: r2.refresh }))).toMatchObject({
      status: 401,
      errorKey: 'SESSION_IDLE_EXPIRED',
    });
    expect(
      await failure(call('RecordInteractiveActivity', {}, { access: r2.access })),
    ).toMatchObject({ status: 401, errorKey: 'SESSION_IDLE_EXPIRED' });
    // Không dựng family/phiên mới để vượt idle.
    expect(await countFamilies()).toBe(familiesBefore);
    expect(await countSessions(fixture.ids.MANAGER_A)).toBe(sessionsBefore);
    writeEvidence('TC-AUTH-03-rpc', {
      case: 'TC-AUTH-03',
      level: 'REAL_RPC_DB_REDIS',
      clock: 'ManualClock injected (no sleep)',
      idle,
      idleUnchangedByPollingAndRefresh: true,
    });
  });

  it('recordInteractiveActivity extends idle by 30 min from the interaction', async () => {
    const issued = await login('MANAGER_C');
    clock.advance(10 * MINUTE);
    const { response } = await call<Record<string, unknown>>(
      'RecordInteractiveActivity',
      {},
      {
        access: issued.access,
      },
    );
    expect(response.result).toMatchObject({ id: issued.sessionId, status: 'ACTIVITY_RECORDED' });
    clock.advance(25 * MINUTE); // 35' sau login, 25' sau tương tác.
    const fresh = await refresh(issued.refresh);
    await call('ListOwnSessions', {}, { access: fresh.access });
    clock.advance(5 * MINUTE); // đúng 30' sau tương tác.
    expect(await failure(call('ListOwnSessions', {}, { access: fresh.access }))).toMatchObject({
      errorKey: 'SESSION_IDLE_EXPIRED',
    });
  });

  it('TC-AUTH-06 logout-all revokes the other session on its next request; repeat is idempotent', async () => {
    const a = await login('MANAGER_AB');
    const b = await login('MANAGER_AB');
    const first = await call<Record<string, unknown>>('Logoutall', {}, { access: a.access });
    expect(first.response.result).toMatchObject({ id: a.sessionId, status: 'REVOKED' });
    expect(await failure(call('ListOwnSessions', {}, { access: b.access }))).toMatchObject({
      status: 401,
      errorKey: 'SESSION_REVOKED',
    });
    expect(await failure(call('Refresh', { refreshCookieToken: b.refresh }))).toMatchObject({
      status: 401,
      errorKey: 'SESSION_REVOKED',
    });
    const again = await call<Record<string, unknown>>('Logoutall', {}, { access: a.access });
    expect(again.response.result).toEqual({
      ...first.response.result,
      traceId: again.response.result.traceId,
    });
    const reasons = await dataSource.query(
      'SELECT revoke_reason_column AS reason FROM auth_session_tbl WHERE id_column IN (?, ?)',
      [a.sessionId, b.sessionId],
    );
    expect(reasons.map((row: { reason: string }) => row.reason)).toEqual([
      'LOGOUT_ALL',
      'LOGOUT_ALL',
    ]);
    writeEvidence('TC-AUTH-06-rpc', {
      case: 'TC-AUTH-06',
      level: 'REAL_RPC_DB_REDIS',
      idempotent: true,
    });
  });

  it('logout is idempotent; lock blocks further use and refresh', async () => {
    const issued = await login('SUP_A1');
    const out1 = await call<Record<string, unknown>>('Logout', {}, { access: issued.access });
    const out2 = await call<Record<string, unknown>>('Logout', {}, { access: issued.access });
    expect(out1.response.result).toMatchObject({
      id: issued.sessionId,
      status: 'REVOKED',
      version: '2',
    });
    expect(out2.response.result).toMatchObject({
      id: issued.sessionId,
      status: 'REVOKED',
      version: '2',
    });
    expect(await failure(call('Refresh', { refreshCookieToken: issued.refresh }))).toMatchObject({
      errorKey: 'SESSION_REVOKED',
    });

    const locked = await login('SUP_A1');
    const lock = await call<Record<string, unknown>>('Lock', {}, { access: locked.access });
    expect(lock.response.result).toMatchObject({ status: 'LOCKED' });
    expect(await failure(call('ListOwnSessions', {}, { access: locked.access }))).toMatchObject({
      status: 401,
      errorKey: 'SESSION_LOCKED',
    });
    expect(await failure(call('Refresh', { refreshCookieToken: locked.refresh }))).toMatchObject({
      status: 401,
      errorKey: 'SESSION_LOCKED',
    });
  });

  it('listOwnSessions / revokeOwnSession only touch the caller sessions', async () => {
    const mine = await login('SUP_A_NO_EXPORT', '10.20.30.40');
    const mine2 = await login('SUP_A_NO_EXPORT');
    const other = await login('ADMIN');

    const { response } = await call<{
      items: Array<Record<string, unknown>>;
      total: string;
      hasPrevious: boolean;
    }>('ListOwnSessions', { pageSize: '100' }, { access: mine.access });
    const ids = response.result.items.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([mine.sessionId, mine2.sessionId]));
    expect(ids).not.toContain(other.sessionId);
    const current = response.result.items.find((item) => item.id === mine.sessionId);
    expect(current).toMatchObject({
      isCurrent: true,
      ipMasked: '10.20.x.x',
      userAgent: 'e2e-agent/1.0 (I-02)',
    });
    expect(JSON.stringify(response.result)).not.toContain('10.20.30.40');
    expect(response.result.hasPrevious).toBe(false);

    const hidden = await failure(
      call('RevokeOwnSession', { id: other.sessionId }, { access: mine.access }),
    );
    expect(hidden).toMatchObject({ status: 404, errorKey: 'SESSION_NOT_FOUND' });
    expect((await sessionRow(other.sessionId)).revokedAt).toBeNull();

    await call('RevokeOwnSession', { id: mine2.sessionId }, { access: mine.access });
    expect(await failure(call('ListOwnSessions', {}, { access: mine2.access }))).toMatchObject({
      errorKey: 'SESSION_REVOKED',
    });
    expect(
      await failure(
        call('ListOwnSessions', { sortBy: 'SORT_BY_NAME', q: 'x' }, { access: mine.access }),
      ),
    ).toMatchObject({
      status: 422,
      fieldKeys: ['q:SESSION_QUERY_UNSUPPORTED', 'sortBy:SESSION_SORT_BY_UNSUPPORTED'],
    });
  });

  it('changeOwnPassword: 12..72 UTF-8 bytes, current password checked, other sessions revoked', async () => {
    const current = await login('SUP_A2');
    const other = await login('SUP_A2');
    const oldPassword = fixture.passwords.SUP_A2;

    expect(
      await failure(
        call(
          'ChangeOwnPassword',
          { data: { currentPassword: oldPassword, newPassword: 'é'.repeat(37) } },
          { access: current.access },
        ),
      ),
    ).toMatchObject({ status: 422, fieldKeys: ['newPassword:SESSION_NEW_PASSWORD_TOO_LONG'] });
    expect(
      await failure(
        call(
          'ChangeOwnPassword',
          { data: { currentPassword: oldPassword, newPassword: 'short' } },
          { access: current.access },
        ),
      ),
    ).toMatchObject({ status: 422, fieldKeys: ['newPassword:SESSION_NEW_PASSWORD_TOO_SHORT'] });
    expect(
      await failure(
        call(
          'ChangeOwnPassword',
          { data: { currentPassword: 'not-the-password', newPassword: 'a-new-password-1' } },
          { access: current.access },
        ),
      ),
    ).toMatchObject({ status: 422, errorKey: 'SESSION_CURRENT_PASSWORD_INCORRECT' });
    // Sau các lần bị từ chối, mật khẩu cũ vẫn dùng được và phiên khác vẫn sống.
    await call('ListOwnSessions', {}, { access: other.access });

    const newPassword = `${'é'.repeat(30)}-new-pass`; // 69 byte, 39 ký tự
    const changed = await call<Record<string, unknown>>(
      'ChangeOwnPassword',
      { data: { currentPassword: oldPassword, newPassword } },
      { access: current.access },
    );
    expect(changed.response.result).toMatchObject({
      id: current.sessionId,
      status: 'PASSWORD_CHANGED',
    });
    expect(await failure(call('ListOwnSessions', {}, { access: other.access }))).toMatchObject({
      errorKey: 'SESSION_REVOKED',
    });
    await call('ListOwnSessions', {}, { access: current.access });
    expect(
      await failure(
        call('Login', {
          data: { phoneNumber: fixture.phonenumbers.SUP_A2, password: oldPassword },
        }),
      ),
    ).toMatchObject({ errorKey: 'SESSION_INVALID_CREDENTIALS' });
    const relogin = await call<LoginRpcResult>('Login', {
      data: { phoneNumber: fixture.phonenumbers.SUP_A2, password: newPassword },
    });
    expect(relogin.response.result.sessionId).toBeDefined();
    expect((await sessionRow(other.sessionId)).reason).toBe('PASSWORD_CHANGED');
    writeEvidence('I02-changeOwnPassword-rpc', {
      case: 'TC-API-changeOwnPassword (RPC part) + TC-AUTH-07 byte rule for own change',
      level: 'REAL_RPC_DB_REDIS',
      rejected73Bytes: true,
      rejectedShort: true,
      otherSessionRevoked: true,
    });
  });

  it('TC-DENY (RPC part) authenticated session RPCs reject missing, foreign and malformed JWT', async () => {
    const foreign = new AccessTokenService('f'.repeat(48), clock).sign({
      sub: fixture.ids.SUP_A1,
      sid: uuidv4(),
    }).token;
    const cases: Array<[string, object]> = [
      ['Logout', {}],
      ['Logoutall', {}],
      ['Lock', {}],
      ['ChangeOwnPassword', { data: { currentPassword: 'x', newPassword: 'y'.repeat(12) } }],
      ['RecordInteractiveActivity', {}],
      ['ListOwnSessions', {}],
      ['RevokeOwnSession', { id: uuidv4() }],
    ];
    const outcomes: Record<string, string[]> = {};
    for (const [rpc, request] of cases) {
      const missing = await failure(call(rpc, request));
      const wrongKey = await failure(call(rpc, request, { access: foreign }));
      const notBearer = await failure(call(rpc, request, { authorization: `Basic ${foreign}` }));
      expect(missing).toMatchObject({ status: 401, errorKey: 'SESSION_ACCESS_TOKEN_MISSING' });
      expect(wrongKey).toMatchObject({ status: 401, errorKey: 'SESSION_ACCESS_TOKEN_INVALID' });
      expect(notBearer).toMatchObject({ status: 401, errorKey: 'SESSION_ACCESS_TOKEN_INVALID' });
      outcomes[rpc] = [missing.errorKey, wrongKey.errorKey, notBearer.errorKey];
    }
    writeEvidence('TC-DENY-session-rpc', {
      case: 'TC-DENY-<op> for 7 AUTHENTICATED ops (RPC part, 401 only; no authority applies)',
      level: 'REAL_RPC_DB_REDIS',
      outcomes,
    });
  });
});
