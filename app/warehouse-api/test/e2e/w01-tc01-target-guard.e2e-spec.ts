import { chmodSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  assertContainerOwnership,
  HarnessTargetError,
  InspectContainer,
  loadHarnessTarget,
  validateTarget,
} from '../harness/target';
import { writeEvidence } from '../harness/evidence';

/**
 * W01-TC01 — target/config sai phải bị chặn TRƯỚC khi mở kết nối hay ghi gì. Suite này không import
 * AppModule/DataSource; `inspect` giả lập docker để kiểm nhánh ownership mà không đụng container thật.
 */
const LABEL = 'warehouse.task=warehouse.e2e-guard-test';

const descriptor = (overrides: { mysql?: object; redis?: object } = {}) => ({
  id: 'GUARD-TEST',
  mysql: {
    container: 'mysql-guard',
    host: '127.0.0.1',
    port: 33306,
    database: 'warehouse_test_guard',
    user: 'guard_user',
    ...overrides.mysql,
  },
  redis: { container: 'redis-guard', host: '127.0.0.1', port: 36379, ...overrides.redis },
});
const credential = {
  password: 'not-a-real-password',
  database: 'warehouse_test_guard',
  user: 'guard_user',
};

const inspectOk: InspectContainer = (name) => ({
  labels: { 'warehouse.task': 'warehouse.e2e-guard-test' },
  hostPorts: [name === 'mysql-guard' ? '33306' : '36379'],
});

const expectRejected = (fn: () => unknown, reason: RegExp) => {
  expect(fn).toThrow(HarnessTargetError);
  expect(fn).toThrow(reason);
};

describe('W01-TC01 harness target guard (fail-closed, no connection)', () => {
  const outcomes: Array<{ case: string; rejected: boolean }> = [];
  const record = (name: string, fn: () => unknown, reason: RegExp) => {
    expectRejected(fn, reason);
    outcomes.push({ case: name, rejected: true });
  };

  afterAll(() => writeEvidence('W01-TC01', { case: 'W01-TC01', level: 'CONFIG_GUARD', outcomes }));

  it('accepts a loopback warehouse_test_* target with matching credential', () => {
    const target = validateTarget(descriptor(), credential, LABEL, {});
    expect(target.mysql.database).toBe('warehouse_test_guard');
    expect(() => assertContainerOwnership(target, inspectOk)).not.toThrow();
  });

  it('rejects a database name outside the test allowlist', () => {
    record(
      'db-name-not-allowlisted',
      () =>
        validateTarget(
          descriptor({ mysql: { database: 'warehouse' } }),
          { password: 'x' },
          LABEL,
          {},
        ),
      /not a warehouse_test_\* DB/,
    );
  });

  it('rejects a non-loopback host', () => {
    record(
      'non-loopback-host',
      () => validateTarget(descriptor({ mysql: { host: '10.0.0.5' } }), credential, LABEL, {}),
      /loopback/,
    );
  });

  it('rejects the MySQL root user', () => {
    record(
      'root-user',
      () => validateTarget(descriptor({ mysql: { user: 'root' } }), { password: 'x' }, LABEL, {}),
      /root user/,
    );
  });

  it('rejects a credential file issued for another database', () => {
    record(
      'credential-other-db',
      () =>
        validateTarget(
          descriptor(),
          { ...credential, database: 'warehouse_test_other' },
          LABEL,
          {},
        ),
      /another database/,
    );
  });

  it('rejects when DATABASE_* / REDIS_* already exist in the environment (e.g. loaded from .env)', () => {
    record(
      'pre-existing-env',
      () => validateTarget(descriptor(), credential, LABEL, { DATABASE_HOST: '127.0.0.1' }),
      /pre-existing DATABASE_HOST/,
    );
  });

  it('rejects a container without the task label', () => {
    const target = validateTarget(descriptor(), credential, LABEL, {});
    record(
      'container-label-mismatch',
      () => assertContainerOwnership(target, (name) => ({ ...inspectOk(name), labels: {} })),
      /does not carry label/,
    );
  });

  it('rejects when the granted port is published by another container', () => {
    const target = validateTarget(descriptor(), credential, LABEL, {});
    record(
      'port-not-owned',
      () =>
        assertContainerOwnership(target, (name) => ({ ...inspectOk(name), hostPorts: ['3306'] })),
      /does not publish host port/,
    );
  });

  it('refuses to run with no grant configured and never inspects containers', () => {
    const inspect = jest.fn<ReturnType<InspectContainer>, [string]>();
    record('no-grant-configured', () => loadHarnessTarget({}, inspect), /WH_E2E_TARGET_FILE/);
    expect(inspect).not.toHaveBeenCalled();
  });

  it('refuses a credential file readable by group/other', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wh-e2e-guard-'));
    const targetFile = join(dir, 'target.json');
    const credentialFile = join(dir, 'cred.json');
    writeFileSync(targetFile, JSON.stringify(descriptor()));
    writeFileSync(credentialFile, JSON.stringify(credential));
    chmodSync(credentialFile, 0o644);
    const inspect = jest.fn<ReturnType<InspectContainer>, [string]>();
    record(
      'credential-file-too-open',
      () =>
        loadHarnessTarget(
          {
            WH_E2E_TARGET_FILE: targetFile,
            WH_E2E_CREDENTIAL_FILE: credentialFile,
            WH_E2E_CONTAINER_LABEL: LABEL,
          },
          inspect,
        ),
      /group\/other/,
    );
    expect(inspect).not.toHaveBeenCalled();
  });
});
