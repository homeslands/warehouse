import { readdirSync } from 'fs';
import { join } from 'path';
import { DataSource, In, Not } from 'typeorm';
import { User } from 'src/user/user.entity';
import { closeDbHarness, createDbHarness } from '../harness/app';
import { MigrationRecord } from '../harness/datasource';
import { writeEvidence } from '../harness/evidence';
import {
  ACTORS,
  countFixtureRows,
  FIXTURE_VERSION,
  LEGACY_GAPS,
  resetFixture,
  seedFixture,
} from '../harness/fixture';
import {
  Barrier,
  connectionId,
  ensureProbeTable,
  openTwoConnections,
  readProbe,
  resetProbeRow,
} from '../harness/race';

/**
 * W01-TC02/03/08 trên MySQL test target thật (đã qua guard). Không HTTP; AppModule không được nạp.
 */
describe('W01 DB harness on the granted test target', () => {
  let dataSource: DataSource;
  let migrations: { applied: string[]; history: MigrationRecord[] };
  let targetId: string;

  beforeAll(async () => {
    const harness = await createDbHarness();
    dataSource = harness.dataSource;
    migrations = harness.migrations;
    targetId = harness.target.id;
  });

  afterAll(async () => {
    await closeDbHarness(dataSource);
  });

  it('W01-TC02 applies every source migration with history and no pending migration', async () => {
    const sourceMigrations = readdirSync(join(__dirname, '..', '..', 'src', 'migrations')).filter(
      (file) => /^\d+-.+\.ts$/.test(file),
    );

    expect(migrations.history).toHaveLength(sourceMigrations.length);
    expect(await dataSource.showMigrations()).toBe(false);
    expect(dataSource.options.synchronize).toBe(false);
    expect(dataSource.options.migrationsRun).toBe(false);
    const [{ db }]: Array<{ db: string }> = await dataSource.query('SELECT DATABASE() AS db');
    expect(db).toMatch(/^warehouse_test_/);

    writeEvidence('W01-TC02', {
      case: 'W01-TC02',
      level: 'REAL_DB',
      targetId,
      database: db,
      appliedThisRun: migrations.applied,
      historyCount: migrations.history.length,
      sourceMigrationFiles: sourceMigrations.length,
      lastMigration: migrations.history[migrations.history.length - 1],
      history: migrations.history,
    });
  });

  it('W01-TC03 seed and reset are repeatable without duplicates and leave other rows alone', async () => {
    const otherUsers = () =>
      dataSource
        .getRepository(User)
        .count({ where: { id: Not(In(ACTORS.map((a) => a.id))) }, withDeleted: true });
    const otherBefore = await otherUsers();
    const saltRounds = Number(process.env.SALT_ROUNDS);

    await seedFixture(dataSource, saltRounds);
    const afterFirstSeed = await countFixtureRows(dataSource);
    await seedFixture(dataSource, saltRounds);
    const afterSecondSeed = await countFixtureRows(dataSource);
    await resetFixture(dataSource);
    const afterFirstReset = await countFixtureRows(dataSource);
    await resetFixture(dataSource);
    const afterSecondReset = await countFixtureRows(dataSource);

    const expected = {
      users: 8,
      phonenumbers: 8,
      warehouses: 3,
      members: 5,
      stores: 2,
      harnessRoles: 2,
    };
    expect(afterFirstSeed).toMatchObject(expected);
    expect(afterSecondSeed).toEqual(afterFirstSeed);
    expect(afterFirstSeed.harnessPermissions).toBeGreaterThan(0);
    for (const counts of [afterFirstReset, afterSecondReset]) {
      expect(Object.values(counts).every((value) => value === 0)).toBe(true);
    }
    expect(await otherUsers()).toBe(otherBefore);

    writeEvidence('W01-TC03', {
      case: 'W01-TC03',
      level: 'REAL_DB',
      targetId,
      fixtureVersion: FIXTURE_VERSION,
      legacyGaps: LEGACY_GAPS,
      afterFirstSeed,
      afterSecondSeed,
      afterFirstReset,
      afterSecondReset,
      nonFixtureUsersBefore: otherBefore,
      nonFixtureUsersAfter: await otherUsers(),
    });
  });

  it('W01-TC08 two connections meet at a barrier; rollback leaves no partial write (helper only, not W04 race)', async () => {
    const probeId = 'w01-tc08';
    await ensureProbeTable(dataSource);
    await resetProbeRow(dataSource, probeId, 100);
    const [first, second] = await openTwoConnections(dataSource);
    const barrier = new Barrier(2);
    const timeline: string[] = [];

    try {
      const ids = [await connectionId(first), await connectionId(second)];
      expect(ids[0]).not.toBe(ids[1]);

      const writer = (async () => {
        await first.startTransaction();
        await first.query('SELECT `value` FROM `e2e_harness_probe_tbl` WHERE `id` = ? FOR UPDATE', [
          probeId,
        ]);
        await first.query('UPDATE `e2e_harness_probe_tbl` SET `value` = 1 WHERE `id` = ?', [
          probeId,
        ]);
        timeline.push('writer:locked+updated');
        await barrier.arrive();
        // Giữ lock thêm một nhịp để reader chắc chắn đang bị chặn trên FOR UPDATE.
        await new Promise((resolve) => setTimeout(resolve, 300));
        timeline.push('writer:rollback');
        await first.rollbackTransaction();
      })();

      const reader = (async () => {
        await barrier.arrive();
        await second.startTransaction();
        timeline.push('reader:waiting-for-lock');
        const [row]: Array<{ value: number }> = await second.query(
          'SELECT `value` FROM `e2e_harness_probe_tbl` WHERE `id` = ? FOR UPDATE',
          [probeId],
        );
        timeline.push(`reader:acquired value=${row.value}`);
        await second.commitTransaction();
        return row.value;
      })();

      const [, seenByReader] = await Promise.all([writer, reader]);

      expect(barrier.waiting).toBe(2);
      expect(seenByReader).toBe(100);
      expect(timeline.indexOf('writer:rollback')).toBeLessThan(
        timeline.findIndex((step) => step.startsWith('reader:acquired')),
      );
      expect(await readProbe(dataSource, probeId)).toBe(100);

      writeEvidence('W01-TC08', {
        case: 'W01-TC08',
        level: 'REAL_DB_HELPER',
        scope: 'Infrastructure helper only — NOT business inventory confirm race (W04)',
        targetId,
        distinctConnections: ids[0] !== ids[1],
        timeline,
        valueSeenByReader: seenByReader,
        valueAfter: await readProbe(dataSource, probeId),
      });
    } finally {
      await first.release();
      await second.release();
    }
  });
});
