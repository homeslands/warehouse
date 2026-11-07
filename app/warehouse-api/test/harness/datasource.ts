import { join } from 'path';
import { DataSource } from 'typeorm';
import { HarnessTarget } from './target';

const SRC = join(__dirname, '..', '..', 'src');

/**
 * DataSource chỉ dùng cho harness: cùng entities/migrations của app, nhưng nhận kết nối từ target
 * đã qua guard (không đọc `process.env`/`.env`), `synchronize` và `migrationsRun` luôn tắt — schema
 * chỉ đến từ migration thật.
 */
export function createHarnessDataSource(target: HarnessTarget): DataSource {
  return new DataSource({
    type: 'mysql',
    host: target.mysql.host,
    port: target.mysql.port,
    username: target.mysql.user,
    password: target.mysql.password,
    database: target.mysql.database,
    entities: [join(SRC, '**', '*.entity{.ts,.js}')],
    migrations: [join(SRC, 'migrations', '*{.ts,.js}')],
    synchronize: false,
    migrationsRun: false,
    dropSchema: false,
    logging: false,
  });
}

export interface MigrationRecord {
  timestamp: string;
  name: string;
}

/** Chạy mọi migration còn pending (mỗi migration một transaction) và trả lịch sử từ bảng `migrations`. */
export async function migrateTarget(
  dataSource: DataSource,
): Promise<{ applied: string[]; history: MigrationRecord[] }> {
  const applied = await dataSource.runMigrations({ transaction: 'each' });
  const history: MigrationRecord[] = await dataSource.query(
    'SELECT `timestamp`, `name` FROM `migrations` ORDER BY `timestamp`',
  );
  return {
    applied: applied.map((migration) => migration.name),
    history: history.map((row) => ({ timestamp: String(row.timestamp), name: row.name })),
  };
}
