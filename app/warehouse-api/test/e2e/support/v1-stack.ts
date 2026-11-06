import { randomBytes } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CSRF_SECRET_MIN_LENGTH, OriginAllowlist } from 'src/grpc/gateway/auth/refresh-cookie';
import { createStorageAuthRuntime } from 'src/grpc/storage/auth/storage-auth.runtime';
import {
  RunningStorageGrpcServer,
  startStorageGrpcServer,
} from 'src/grpc/storage/storage-grpc.server';
import { GatewayConfig } from 'src/gateway/gateway.config';
import { configureGatewayApp, GatewayModule } from 'src/gateway/gateway.module';
import { TestPki } from '../../grpc/test-pki';
import { closeDbHarness, createDbHarness } from '../../harness/app';
import { MigrationRecord } from '../../harness/datasource';
import { SeededFixture, seedFixture } from '../../harness/fixture';

/**
 * Stack v1 THẬT cho e2e (W02 I-03a): harness DB (guard WH-TEST-ENV) + Redis của target → Storage runtime
 * (SessionService + RBAC handler) trên gRPC mTLS loopback (PKI test) → Gateway Nest/Express. Không mock.
 * Redis: DB 0 cho rate limit (namespace riêng mỗi run), `REDIS_AUTH_DB` (harness = 1) cho cache RBAC legacy.
 */
export const ALLOWED_ORIGIN = 'https://wh.example.test';
const STORAGE_NAME = 'warehouse-storage';
const GATEWAY_NAME = 'warehouse-gateway';
const REDIS_NAMESPACE = 'wh:preimpl:20261105:';

export class ManualClock {
  private current = new Date();
  now(): Date {
    return new Date(this.current.getTime());
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export interface V1Stack {
  targetId: string;
  dataSource: DataSource;
  migrations: { applied: string[]; history: MigrationRecord[] };
  fixture: SeededFixture;
  /** Client Redis của DB cache RBAC legacy (`REDIS_AUTH_DB`). */
  authRedis: Redis;
  clock: ManualClock;
  storageErrors: string[];
  http(): ReturnType<typeof request>;
  /** Login HTTP thật; trả access token. IP riêng cho mỗi lần để không chạm throttle. */
  login(alias: keyof SeededFixture['ids']): Promise<string>;
  close(): Promise<void>;
}

export async function createV1Stack(tag: string): Promise<V1Stack> {
  const harness = await createDbHarness();
  const { dataSource } = harness;
  const fixture = await seedFixture(dataSource, Number(process.env.SALT_ROUNDS));
  const redisOptions = { host: harness.target.redis.host, port: harness.target.redis.port };
  const redis = new Redis({ ...redisOptions, lazyConnect: true });
  const authRedis = new Redis({
    ...redisOptions,
    db: Number(process.env.REDIS_AUTH_DB),
    lazyConnect: true,
  });
  await redis.connect();
  await authRedis.connect();
  const rateLimitPrefix = `${REDIS_NAMESPACE}${tag}:${uuidv4()}:`;
  const clock = new ManualClock();
  const accessSecret = randomBytes(32).toString('hex');
  const storageErrors: string[] = [];

  const runtime = await createStorageAuthRuntime({
    dataSource,
    redis,
    legacyRbacRedis: authRedis,
    config: {
      accessTokenSecret: accessSecret,
      saltRounds: Number(process.env.SALT_ROUNDS),
      rateLimitPrefix,
    },
    clock,
    logError: (message) => storageErrors.push(message),
    logWarn: (message) => storageErrors.push(message),
  });

  const pki = new TestPki();
  const ca = pki.createCa(`wh-${tag}-ca`);
  const storageCert = pki.issue(ca, 'storage', STORAGE_NAME, 'serverAuth');
  const gatewayCert = pki.issue(ca, 'gateway', GATEWAY_NAME, 'clientAuth');
  const storage: RunningStorageGrpcServer = await startStorageGrpcServer(
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
    trustProxy: 'loopback',
  };
  const moduleRef = await Test.createTestingModule({
    imports: [GatewayModule.forConfig(config, clock)],
  }).compile();
  const gateway: INestApplication = moduleRef.createNestApplication({ logger: ['error'] });
  configureGatewayApp(gateway, config);
  await gateway.init();

  let ipCounter = 0;
  const http = () => request(gateway.getHttpServer());
  return {
    targetId: harness.target.id,
    dataSource,
    migrations: harness.migrations,
    fixture,
    authRedis,
    clock,
    storageErrors,
    http,
    async login(alias) {
      ipCounter += 1;
      const response = await http()
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', `192.0.2.${ipCounter}`)
        .send({ phoneNumber: fixture.phonenumbers[alias], password: fixture.passwords[alias] });
      if (response.status !== 200) throw new Error(`login ${alias} failed: ${response.status}`);
      return response.body.result.accessToken as string;
    },
    async close() {
      await gateway.close();
      await storage.shutdown();
      pki.cleanup();
      const keys = await redis.keys(`${rateLimitPrefix}*`);
      if (keys.length) await redis.del(...keys);
      await redis.quit();
      await authRedis.quit();
      await closeDbHarness(dataSource);
    },
  };
}
