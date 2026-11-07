import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  loadStorageProto,
  rpcNameForOperation,
  STORAGE_PROTO_PATH,
  STORAGE_SERVICE,
} from './storage-proto';

/** 37 operationId của gói W02 (dossier W02 / OpenAPI R2), xem W02-BE-01 mục 2. */
const W02_OPERATIONS = [
  'login',
  'refresh',
  'logout',
  'logoutall',
  'lock',
  'changeOwnPassword',
  'getProfile',
  'updateProfile',
  'recordInteractiveActivity',
  'listOwnSessions',
  'revokeOwnSession',
  'listUsers',
  'createUser',
  'getUser',
  'updateUser',
  'deleteUser',
  'changeUserRole',
  'resetUserPassword',
  'listRoles',
  'createRole',
  'getRole',
  'updateRole',
  'deleteRole',
  'listAuthorities',
  'listAuthorityGroups',
  'updateAuthorityMetadata',
  'putRoleAuthority',
  'deleteRoleAuthority',
  'uploadFile',
  'getFileMetadata',
  'getFileAccess',
  'listAuditEvents',
  'listTechnicalLogs',
  'listBackupRequests',
  'createBackupRequest',
  'createRestoreRequest',
  'getJob',
] as const;

const BASELINE_PROTO = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'docs',
  'project',
  'baseline',
  'contracts',
  'warehouse-storage.proto',
);

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

interface MethodDefinition {
  requestStream: boolean;
  responseStream: boolean;
  requestSerialize(value: object): Buffer;
  requestDeserialize(bytes: Buffer): Record<string, unknown>;
  responseSerialize(value: object): Buffer;
  responseDeserialize(bytes: Buffer): Record<string, unknown>;
}

/** Mọi key (đệ quy) của một object đã decode — để bắt key ảo `_<field>`. */
const allKeys = (value: unknown): string[] =>
  value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, nested]) => [key, ...allKeys(nested)])
    : [];

describe('Storage gRPC contract (R2 proto)', () => {
  const definition = loadStorageProto();
  const service = definition[STORAGE_SERVICE] as unknown as Record<string, MethodDefinition>;

  it('ships a byte-identical copy of the approved R2 proto', () => {
    expect(sha256(STORAGE_PROTO_PATH)).toBe(sha256(BASELINE_PROTO));
  });

  it('exposes the WarehouseStorage service', () => {
    expect(service).toBeDefined();
    expect(Object.keys(service)).toHaveLength(161);
  });

  it.each(W02_OPERATIONS)('has an RPC for W02 operation %s', (operationId) => {
    expect(service[rpcNameForOperation(operationId)]).toBeDefined();
  });

  it('streams file uploads from the client and returns a single response', () => {
    expect(service.UploadFile.requestStream).toBe(true);
    expect(service.UploadFile.responseStream).toBe(false);
  });

  it('maps operationId to RPC name by upper-casing the first letter', () => {
    expect(rpcNameForOperation('listOwnSessions')).toBe('ListOwnSessions');
    expect(rpcNameForOperation('logoutall')).toBe('Logoutall');
  });

  describe('wire round-trip with the shared loader options', () => {
    it('decodes a response without virtual `_<field>` keys and keeps empty repeated fields', () => {
      const method = service.GetRole;
      const decoded = method.responseDeserialize(
        method.responseSerialize({
          result: {
            id: 'r1',
            name: 'Admin',
            family: 'FAMILY_ADMIN',
            builtIn: false,
            authorityCodes: [],
          },
          meta: { traceId: 't1', timestamp: '2026-11-06T00:00:00Z' },
        }),
      );

      expect(allKeys(decoded).filter((key) => key.startsWith('_'))).toEqual([]);
      expect(decoded.result).toEqual({
        id: 'r1',
        name: 'Admin',
        family: 'FAMILY_ADMIN',
        builtIn: false,
        authorityCodes: [],
        // `arrays: true` điền `[]` cho mọi `repeated`; `highlights` là property hợp lệ của OpenAPI `Role`.
        highlights: [],
      });
    });

    it('keeps presence of explicitly sent zero values and omits unsent optional fields', () => {
      const method = service.UpdateRole;
      const decoded = method.requestDeserialize(
        method.requestSerialize({
          id: 'r1',
          data: { version: '0' },
          context: { traceId: 't1', expectedVersion: '0' },
          clearFields: [],
        }),
      );

      expect(allKeys(decoded).filter((key) => key.startsWith('_'))).toEqual([]);
      expect(decoded.data).toEqual({ version: '0' });
      expect(decoded.context).toEqual({ traceId: 't1', expectedVersion: '0' });
      expect(decoded.data).not.toHaveProperty('name');
      expect(decoded.clearFields).toEqual([]);
    });
  });
});
