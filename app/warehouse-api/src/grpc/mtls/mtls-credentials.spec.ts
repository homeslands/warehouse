import { ConfigService } from '@nestjs/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { TestPki } from '../../../test/grpc/test-pki';
import { readStorageGrpcClientConfig } from '../gateway/storage-grpc-client.module';
import { StorageGrpcClient } from '../gateway/storage-grpc.client';
import { STORAGE_GRPC_CONFIG_KEYS } from '../grpc.constants';
import { loadMtlsMaterial, MtlsConfigError, peerIdentity } from './mtls-credentials';

jest.setTimeout(30_000);

describe('mTLS material and Gateway client config', () => {
  const pki = new TestPki();
  const ca = pki.createCa('wh-unit-ca');
  const leaf = pki.issue(ca, 'leaf', 'warehouse-gateway', 'clientAuth');
  const notPem = join(pki.dir, 'not-pem.txt');
  writeFileSync(notPem, 'hello');

  afterAll(() => pki.cleanup());

  it('loads PEM CA, certificate and key', () => {
    const material = loadMtlsMaterial({
      caPath: ca.certPath,
      certPath: leaf.certPath,
      keyPath: leaf.keyPath,
    });
    expect(material.cert.equals(leaf.cert)).toBe(true);
    expect(material.key.equals(leaf.key)).toBe(true);
  });

  it.each([
    ['missing file', { caPath: join(pki.dir, 'missing.crt') }, 'mTLS CA file cannot be read'],
    ['empty path', { caPath: '' }, 'mTLS CA path is not configured'],
    ['non-PEM certificate', { certPath: notPem }, 'mTLS certificate is not PEM'],
    ['a certificate given as key', { keyPath: leaf.certPath }, 'mTLS private key is not PEM'],
  ])('fails with a labelled error on %s, without file contents', (_label, override, message) => {
    const paths = {
      caPath: ca.certPath,
      certPath: leaf.certPath,
      keyPath: leaf.keyPath,
      ...override,
    };
    expect(() => loadMtlsMaterial(paths)).toThrow(new MtlsConfigError(message));
  });

  it('reads identity only from a TLS peer certificate CN', () => {
    expect(peerIdentity(undefined)).toBeUndefined();
    expect(peerIdentity({ transportSecurityType: 'insecure' })).toBeUndefined();
    expect(peerIdentity({ transportSecurityType: 'ssl' })).toBeUndefined();
  });

  describe('readStorageGrpcClientConfig', () => {
    const keys = STORAGE_GRPC_CONFIG_KEYS;
    const values = {
      [keys.address]: '127.0.0.1:50051',
      [keys.serverName]: 'warehouse-storage',
      [keys.caPath]: ca.certPath,
      [keys.certPath]: leaf.certPath,
      [keys.keyPath]: leaf.keyPath,
      [keys.deadlineMs]: '3000',
    };

    it('reads every value through ConfigService', () => {
      const config = readStorageGrpcClientConfig(new ConfigService(values));
      expect(config).toMatchObject({
        address: '127.0.0.1:50051',
        serverName: 'warehouse-storage',
        deadlineMs: 3000,
      });
    });

    it.each(Object.values(keys))('fails when %s is missing', (key) => {
      const partial = { ...values };
      delete partial[key];
      expect(() => readStorageGrpcClientConfig(new ConfigService(partial))).toThrow(key);
    });

    it.each(['0', '-1', '1.5', 'abc'])('refuses deadline %p', (deadline) => {
      const config = readStorageGrpcClientConfig(
        new ConfigService({ ...values, [keys.deadlineMs]: deadline }),
      );
      expect(() => new StorageGrpcClient(config)).toThrow(RangeError);
    });
  });
});
