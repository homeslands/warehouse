import { ConfigService } from '@nestjs/config';
import { TestPki } from '../../test/grpc/test-pki';
import { GatewayConfigError, readGatewayConfig } from './gateway.config';

describe('readGatewayConfig (fail-closed Gateway v1 configuration)', () => {
  let pki: TestPki;
  let base: Record<string, string>;
  const SECRET = 's'.repeat(40);
  const ACCESS = 'a'.repeat(40);

  beforeAll(() => {
    pki = new TestPki();
    const ca = pki.createCa('cfg-ca');
    const gateway = pki.issue(ca, 'gateway', 'warehouse-gateway', 'clientAuth');
    base = {
      STORAGE_GRPC_ADDRESS: '127.0.0.1:50051',
      STORAGE_GRPC_SERVER_NAME: 'warehouse-storage',
      STORAGE_GRPC_CA_PATH: ca.certPath,
      GATEWAY_GRPC_CERT_PATH: gateway.certPath,
      GATEWAY_GRPC_KEY_PATH: gateway.keyPath,
      STORAGE_GRPC_DEADLINE_MS: '5000',
      V1_ACCESS_TOKEN_SECRET: ACCESS,
      GATEWAY_CSRF_SECRET: SECRET,
      GATEWAY_ORIGIN_ALLOWLIST: 'https://wh.example.vn, http://localhost:5173',
    };
  });

  afterAll(() => pki.cleanup());

  const read = (overrides: Record<string, string | undefined>) => {
    const values = { ...base, ...overrides };
    for (const key of Object.keys(values)) if (values[key] === undefined) delete values[key];
    return readGatewayConfig(new ConfigService(values));
  };

  it('reads a valid configuration with secure defaults', () => {
    const config = read({});
    expect(config.cookieSecure).toBe(true);
    expect(config.trustProxy).toBeUndefined();
    expect(config.origins).toEqual(['https://wh.example.vn', 'http://localhost:5173']);
    expect(config.originAllowlist.allows('https://wh.example.vn')).toBe(true);
    expect(config.storage.deadlineMs).toBe(5000);
    expect(read({ GATEWAY_TRUST_PROXY: 'loopback, 10.0.0.0/8' }).trustProxy).toBe(
      'loopback,10.0.0.0/8',
    );
    expect(read({ GATEWAY_TRUST_PROXY: '1', GATEWAY_PORT: '8086' })).toMatchObject({
      trustProxy: 1,
      port: 8086,
    });
    expect(read({ GATEWAY_COOKIE_SECURE: 'false' }).cookieSecure).toBe(false);
  });

  it.each([
    ['missing CSRF secret', { GATEWAY_CSRF_SECRET: undefined }, 'GATEWAY_CSRF_SECRET'],
    ['short CSRF secret', { GATEWAY_CSRF_SECRET: 'short' }, 'GATEWAY_CSRF_SECRET'],
    ['short access secret', { V1_ACCESS_TOKEN_SECRET: 'x' }, 'V1_ACCESS_TOKEN_SECRET'],
    ['missing allowlist', { GATEWAY_ORIGIN_ALLOWLIST: undefined }, 'GATEWAY_ORIGIN_ALLOWLIST'],
    ['wildcard origin', { GATEWAY_ORIGIN_ALLOWLIST: '*' }, 'GATEWAY_ORIGIN_ALLOWLIST'],
    [
      'origin with path',
      { GATEWAY_ORIGIN_ALLOWLIST: 'https://a.vn/app' },
      'GATEWAY_ORIGIN_ALLOWLIST',
    ],
    [
      'empty origin entry',
      { GATEWAY_ORIGIN_ALLOWLIST: 'https://a.vn,' },
      'GATEWAY_ORIGIN_ALLOWLIST',
    ],
    ['bad cookie flag', { GATEWAY_COOKIE_SECURE: 'yes' }, 'GATEWAY_COOKIE_SECURE'],
    ['bad trust proxy', { GATEWAY_TRUST_PROXY: 'everyone' }, 'GATEWAY_TRUST_PROXY'],
    ['too many hops', { GATEWAY_TRUST_PROXY: '11' }, 'GATEWAY_TRUST_PROXY'],
    ['bad port', { GATEWAY_PORT: '70000' }, 'GATEWAY_PORT'],
  ])('rejects %s without echoing the value', (_name, overrides, key) => {
    let error: unknown;
    try {
      read(overrides);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(GatewayConfigError);
    expect((error as Error).message).toContain(key);
    for (const value of Object.values(overrides))
      if (value && value.length > 3) expect((error as Error).message).not.toContain(value);
  });

  it('rejects missing Storage gRPC settings and an out-of-range deadline', () => {
    expect(() => read({ STORAGE_GRPC_ADDRESS: undefined })).toThrow();
    expect(() => read({ STORAGE_GRPC_DEADLINE_MS: '30001' })).toThrow(RangeError);
  });
});
