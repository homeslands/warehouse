import { chmodSync, rmSync, writeFileSync } from 'fs';
import { isAbsolute, relative, resolve } from 'path';
import { createHarness } from './app';
import { ActorAlias } from './fixture';
import { HarnessTargetError } from './target';

/**
 * Chế độ serve test-only cho FE/QA (W01-FE-02, W01-QA-02): guard → migrate → seed → listen CHỈ trên
 * loopback, cùng composition với e2e (guard/repository/MySQL/Redis thật, Firebase/S3 SIMULATED,
 * cron dừng). Mật khẩu actor của lần seed này được ghi vào file 0600 NGOÀI repo do người chạy chỉ
 * định; file bị xoá khi dừng serve. Không in mật khẩu ra stdout.
 *
 *   WH_E2E_FIXTURE_SECRET_FILE=/abs/outside/repo.json WH_E2E_PORT=18085 npm run test:e2e:serve
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

function secretFilePath(): string {
  const path = process.env.WH_E2E_FIXTURE_SECRET_FILE ?? '';
  if (!isAbsolute(path))
    throw new HarnessTargetError('WH_E2E_FIXTURE_SECRET_FILE must be an absolute path');
  if (!relative(REPO_ROOT, path).startsWith('..'))
    throw new HarnessTargetError('WH_E2E_FIXTURE_SECRET_FILE must be outside the repository');
  return path;
}

function port(): number {
  const value = Number(process.env.WH_E2E_PORT ?? '0');
  if (!Number.isInteger(value) || value < 0 || value > 65535)
    throw new HarnessTargetError('WH_E2E_PORT must be a TCP port (0 = random)');
  return value;
}

async function main(): Promise<void> {
  // Đọc biến điều khiển TRƯỚC khi guard/kết nối để cấu hình sai không mở kết nối nào.
  const secretFile = secretFilePath();
  const listenPort = port();

  const harness = await createHarness();
  await harness.app.listen(listenPort, '127.0.0.1');
  const address = harness.app.getHttpServer().address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}${harness.prefix}`;

  const { fixture } = harness;
  const actors = Object.fromEntries(
    (Object.keys(fixture.passwords) as ActorAlias[]).map((alias) => [
      alias,
      {
        id: fixture.ids[alias],
        phonenumber: fixture.phonenumbers[alias],
        password: fixture.passwords[alias],
      },
    ]),
  );
  writeFileSync(
    secretFile,
    `${JSON.stringify({ baseUrl, targetId: harness.target.id, fixtureVersion: fixture.version, warehouses: fixture.warehouseSlugs, actors }, null, 2)}\n`,
    { mode: 0o600 },
  );
  chmodSync(secretFile, 0o600);

  process.stdout.write(
    `[e2e-harness] serving ${baseUrl} (target ${harness.target.id}, fixture ${fixture.version})\n` +
      `[e2e-harness] actor credentials written to ${secretFile} (0600); Ctrl+C to stop\n`,
  );

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    rmSync(secretFile, { force: true });
    await harness.close();
    process.stdout.write('[e2e-harness] stopped; credential file removed\n');
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
