import { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import session from 'express-session';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import {
  applyHarnessEnv,
  isolateWorkingDirectory,
  restoreWorkingDirectory,
  SIMULATED,
} from './env';
import { createHarnessDataSource, migrateTarget, MigrationRecord } from './datasource';
import { ACTORS, HARNESS_ROLES, SeededFixture, seedFixture } from './fixture';
import { HarnessTarget, loadHarnessTarget } from './target';

/** Ghi lại mọi lần app định gọi ra ngoài — bằng chứng provider đã bị thay, kết quả là SIMULATED. */
export interface SimulatedCall {
  provider: 'firebase' | 's3';
  method: string;
}

class SimulatedFirebaseService {
  constructor(private readonly calls: SimulatedCall[]) {}
  onModuleInit(): void {
    this.calls.push({ provider: 'firebase', method: 'onModuleInit' });
  }
  async sendToAllPlatforms(): Promise<string> {
    this.calls.push({ provider: 'firebase', method: 'sendToAllPlatforms' });
    return SIMULATED;
  }
  async sendToDevice(): Promise<string> {
    this.calls.push({ provider: 'firebase', method: 'sendToDevice' });
    return SIMULATED;
  }
}

class SimulatedS3Service {
  constructor(private readonly calls: SimulatedCall[]) {}
  async uploadFile(): Promise<string> {
    this.calls.push({ provider: 's3', method: 'uploadFile' });
    return `${SIMULATED}/object`;
  }
  async uploadFiles(files: unknown[]): Promise<string[]> {
    this.calls.push({ provider: 's3', method: 'uploadFiles' });
    return files.map((_, index) => `${SIMULATED}/object-${index}`);
  }
  getFileUrl(key: string): string {
    return `${SIMULATED}/${key}`;
  }
  async deleteFile(): Promise<void> {
    this.calls.push({ provider: 's3', method: 'deleteFile' });
  }
}

export interface Harness {
  target: HarnessTarget;
  dataSource: DataSource;
  migrations: { applied: string[]; history: MigrationRecord[] };
  fixture: SeededFixture;
  app: INestApplication;
  prefix: string;
  simulatedCalls: SimulatedCall[];
  stoppedCronJobs: string[];
  /** Xoá cache RBAC Redis của actor/role harness (sau khi đổi role trong DB). */
  clearRbacCache(): Promise<void>;
  /** Reset + seed lại fixture, xoá cache RBAC của actor harness. */
  reseed(): Promise<SeededFixture>;
  close(): Promise<void>;
}

/** Guard + env + cwd: phải chạy TRƯỚC khi import AppModule hay mở bất kỳ kết nối nào. */
export function prepareHarnessProcess(): HarnessTarget {
  const target = loadHarnessTarget();
  isolateWorkingDirectory();
  applyHarnessEnv(target);
  return target;
}

/** Chỉ DB: guard → migrate → seed. Dùng cho TC02/TC03/TC08 không cần HTTP. */
export async function createDbHarness(): Promise<{
  target: HarnessTarget;
  dataSource: DataSource;
  migrations: { applied: string[]; history: MigrationRecord[] };
}> {
  const target = prepareHarnessProcess();
  let dataSource: DataSource;
  try {
    dataSource = await createHarnessDataSource(target).initialize();
  } catch (error) {
    restoreWorkingDirectory();
    throw error;
  }
  try {
    const migrations = await migrateTarget(dataSource);
    return { target, dataSource, migrations };
  } catch (error) {
    await dataSource.destroy();
    restoreWorkingDirectory();
    throw error;
  }
}

/** Đóng DataSource của `createDbHarness` và dọn cwd tạm. */
export async function closeDbHarness(dataSource: DataSource | undefined): Promise<void> {
  if (dataSource?.isInitialized) await dataSource.destroy();
  restoreWorkingDirectory();
}

/**
 * App thật: AppModule đầy đủ (guard, repository, MySQL, Redis, Bull), chỉ thay Firebase/S3 bằng bản
 * SIMULATED và dừng cron. Dựng prefix/CORS/session giống `main.ts`. Không override guard/repository.
 */
export async function createHarness(): Promise<Harness> {
  const { target, dataSource, migrations } = await createDbHarness();
  try {
    return await composeHarness(target, dataSource, migrations);
  } catch (error) {
    await closeDbHarness(dataSource);
    throw error;
  }
}

async function composeHarness(
  target: HarnessTarget,
  dataSource: DataSource,
  migrations: { applied: string[]; history: MigrationRecord[] },
): Promise<Harness> {
  const saltRounds = Number(process.env.SALT_ROUNDS);
  let fixture = await seedFixture(dataSource, saltRounds);

  // Import động: `ConfigModule.forRoot()` chạy lúc nạp file AppModule ⇒ phải sau khi env/cwd đã cô lập.
  const { AppModule } = await import('src/app/app.module');
  const { FirebaseService } = await import('src/notification/firebase/firebase.service');
  const { S3Service } = await import('src/file/s3/s3.service');
  const { corsOptions } = await import('src/config/cors.config');
  const { sessionConfig } = await import('src/config/session.config');

  const simulatedCalls: SimulatedCall[] = [];
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FirebaseService)
    .useValue(new SimulatedFirebaseService(simulatedCalls))
    .overrideProvider(S3Service)
    .useValue(new SimulatedS3Service(simulatedCalls))
    .compile();

  const app = moduleRef.createNestApplication({ logger: ['error'] });
  const prefix = `api/${process.env.VERSION}`;
  app.setGlobalPrefix(prefix);
  app.enableCors(corsOptions());
  const sessionOptions = sessionConfig();
  app.use(session(sessionOptions));
  await app.init();

  const registry = app.get(SchedulerRegistry);
  const stoppedCronJobs: string[] = [];
  for (const [name, job] of registry.getCronJobs()) {
    await job.stop();
    stoppedCronJobs.push(name);
  }

  const redis = new Redis({
    host: target.redis.host,
    port: target.redis.port,
    db: Number(process.env.REDIS_AUTH_DB),
    lazyConnect: true,
  });
  await redis.connect();
  const clearRbacCache = async () => {
    const keys = [
      ...ACTORS.map((actor) => `rbac:user:${actor.id}`),
      ...Object.keys(HARNESS_ROLES).map((role) => `rbac:role:${role}:authorities`),
    ];
    await redis.del(...keys);
  };
  await clearRbacCache();

  return {
    target,
    dataSource,
    migrations,
    get fixture() {
      return fixture;
    },
    app,
    prefix: `/${prefix}`,
    simulatedCalls,
    stoppedCronJobs,
    clearRbacCache,
    async reseed() {
      fixture = await seedFixture(dataSource, saltRounds);
      await clearRbacCache();
      return fixture;
    },
    async close() {
      await app.close();
      const store = sessionOptions.store as unknown as { close?: () => Promise<void> } | undefined;
      await store?.close?.();
      await redis.quit();
      await closeDbHarness(dataSource);
    },
  };
}
