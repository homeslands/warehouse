import { DataSource, QueryRunner } from 'typeorm';

/**
 * Helper HẠ TẦNG cho test đồng thời: barrier + hai connection + transaction rollback.
 * KHÔNG chứng minh race nghiệp vụ tồn kho (confirm phiếu W04) — chỉ chứng minh harness có thể
 * điều phối hai transaction thật trên MySQL test target.
 */
export const PROBE_TABLE = 'e2e_harness_probe_tbl';

/** Barrier n bên: mọi bên gọi `arrive()` đều chờ tới khi đủ n bên cùng tới. */
export class Barrier {
  private arrived = 0;
  private release!: () => void;
  private readonly gate = new Promise<void>((resolve) => (this.release = resolve));

  constructor(private readonly parties: number) {
    if (parties < 2) throw new Error('Barrier needs at least 2 parties');
  }

  get waiting(): number {
    return this.arrived;
  }

  async arrive(): Promise<void> {
    this.arrived += 1;
    if (this.arrived === this.parties) this.release();
    await this.gate;
  }
}

export async function ensureProbeTable(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    `CREATE TABLE IF NOT EXISTS \`${PROBE_TABLE}\` (
       \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
       \`value\` INT NOT NULL
     ) ENGINE=InnoDB`,
  );
}

export async function resetProbeRow(
  dataSource: DataSource,
  id: string,
  value: number,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO \`${PROBE_TABLE}\` (\`id\`, \`value\`) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
    [id, value],
  );
}

export async function readProbe(runner: DataSource | QueryRunner, id: string): Promise<number> {
  const rows: Array<{ value: number }> = await runner.query(
    `SELECT \`value\` FROM \`${PROBE_TABLE}\` WHERE \`id\` = ?`,
    [id],
  );
  return rows[0]?.value;
}

/** Hai QueryRunner = hai connection vật lý riêng trong pool; caller phải `release()`. */
export async function openTwoConnections(
  dataSource: DataSource,
): Promise<[QueryRunner, QueryRunner]> {
  const first = dataSource.createQueryRunner();
  const second = dataSource.createQueryRunner();
  await first.connect();
  await second.connect();
  return [first, second];
}

export async function connectionId(runner: QueryRunner): Promise<number> {
  const [row]: Array<{ id: number }> = await runner.query('SELECT CONNECTION_ID() AS id');
  return Number(row.id);
}
