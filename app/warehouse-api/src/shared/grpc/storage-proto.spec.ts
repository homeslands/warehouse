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
}

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
});
