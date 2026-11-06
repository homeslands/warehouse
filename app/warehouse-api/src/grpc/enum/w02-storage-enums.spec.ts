import { readFileSync } from 'fs';
import { join } from 'path';
import { loadStorageProto, STORAGE_PACKAGE, STORAGE_SERVICE } from 'src/shared/grpc/storage-proto';
import { getStorageProto } from '../storage-proto.runtime';
import {
  StorageEnumAdapter,
  StorageEnumContractError,
  StorageEnumMappingError,
} from './storage-enum.adapter';
import { createW02EnumAdapters, W02_ENUM_SPECS, w02EnumAdapter } from './w02-storage-enums';

/** 37 operationId W02 (W02-BE-01 mục 2). */
const W02_OPERATIONS = [
  'login', 'refresh', 'logout', 'logoutall', 'lock', 'changeOwnPassword', 'getProfile',
  'updateProfile', 'recordInteractiveActivity', 'listOwnSessions', 'revokeOwnSession', 'listUsers',
  'createUser', 'getUser', 'updateUser', 'deleteUser', 'changeUserRole', 'resetUserPassword',
  'listRoles', 'createRole', 'getRole', 'updateRole', 'deleteRole', 'listAuthorities',
  'listAuthorityGroups', 'updateAuthorityMetadata', 'putRoleAuthority', 'deleteRoleAuthority',
  'uploadFile', 'getFileMetadata', 'getFileAccess', 'listAuditEvents', 'listTechnicalLogs',
  'listBackupRequests', 'createBackupRequest', 'createRestoreRequest', 'getJob',
]; // prettier-ignore

/**
 * Enum OpenAPI W02 cố ý không có adapter prefix: proto `FileUploadHeader.purpose` là `string`
 * (không phải enum). Câu hỏi mở cho I-04: giá trị trên dây là `GENERIC` hay `PURPOSE_GENERIC`.
 */
const STRING_ON_WIRE = {
  'uploadFile.body.purpose': { message: 'FileUploadHeader', field: 'purpose' },
};

const OPENAPI_PATH = join(
  __dirname, '..', '..', '..', '..', '..', 'docs', 'project', 'baseline', 'contracts', 'openapi-v1.json',
); // prettier-ignore

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Mọi enum OpenAPI chạm tới từ 37 operation W02: `<Schema>.<prop>`, `<op>?<param>`, `<op>.body.<prop>`. */
function openApiW02Enums(): Map<string, string[]> {
  const document = JSON.parse(readFileSync(OPENAPI_PATH, 'utf8')) as Json;
  const schemas = (document.components as Json).schemas as Json;
  const found = new Map<string, string[]>();

  const walk = (node: unknown, location: string, seen: ReadonlySet<string>): void => {
    if (Array.isArray(node)) return node.forEach((item) => walk(item, location, seen));
    if (!isObject(node)) return;
    if (typeof node.$ref === 'string') {
      const name = node.$ref.split('/').pop();
      if (!seen.has(name)) walk(schemas[name], name, new Set([...seen, name]));
      return;
    }
    if (Array.isArray(node.enum) && !found.has(location))
      found.set(location, node.enum as string[]);
    for (const [key, value] of Object.entries(node)) {
      if (key === 'properties' && isObject(value))
        Object.entries(value).forEach(([prop, schema]) =>
          walk(schema, `${location}.${prop}`, seen),
        );
      else walk(value, location, seen);
    }
  };

  for (const pathItem of Object.values(document.paths as Json)) {
    for (const operation of Object.values(pathItem as Json)) {
      if (!isObject(operation) || !W02_OPERATIONS.includes(operation.operationId as string))
        continue;
      const operationId = operation.operationId as string;
      for (const parameter of (operation.parameters as Json[]) ?? []) {
        const schema = parameter.schema as Json;
        if (Array.isArray(schema?.enum)) found.set(`${operationId}?${parameter.name}`, schema.enum);
      }
      walk(operation.requestBody, `${operationId}.body`, new Set());
      walk(operation.responses, `${operationId}.response`, new Set());
    }
  }
  return found;
}

interface FieldDescriptor {
  name: string;
  type: string;
  typeName: string;
}

/** Mọi field enum trong message request/response (đệ quy) của 37 RPC W02: `<Message>.<field>`. */
function protoW02EnumFields(): Set<string> {
  const definition = loadStorageProto();
  const service = definition[STORAGE_SERVICE] as unknown as Record<
    string,
    { requestType: { type: { name: string } }; responseType: { type: { name: string } } }
  >;
  const fields = new Set<string>();
  const visited = new Set<string>();
  const resolve = (typeName: string, scope: string) =>
    [`${scope}.${typeName}`, `${STORAGE_PACKAGE}.${typeName}`].find((name) => definition[name]);
  const visit = (fullName: string) => {
    if (!fullName || visited.has(fullName)) return;
    visited.add(fullName);
    for (const field of (definition[fullName].type as { field: FieldDescriptor[] }).field) {
      const owner = fullName.slice(STORAGE_PACKAGE.length + 1);
      if (field.type === 'TYPE_ENUM') fields.add(`${owner}.${field.name}`);
      if (field.type === 'TYPE_MESSAGE') visit(resolve(field.typeName, fullName));
    }
  };
  for (const operationId of W02_OPERATIONS) {
    const method = service[operationId.charAt(0).toUpperCase() + operationId.slice(1)];
    visit(`${STORAGE_PACKAGE}.${method.requestType.type.name}`);
    visit(`${STORAGE_PACKAGE}.${method.responseType.type.name}`);
  }
  return fields;
}

describe('W02 enum adapters (DEV-197-02)', () => {
  const adapters = createW02EnumAdapters(loadStorageProto());
  const openApi = openApiW02Enums();

  it('covers exactly the OpenAPI enums of the 37 W02 operations', () => {
    const expected = [...openApi.keys()].sort();
    expect([...Object.keys(W02_ENUM_SPECS), ...Object.keys(STRING_ON_WIRE)].sort()).toEqual(
      expected,
    );
  });

  it('covers every enum field of the W02 RPC messages in the proto', () => {
    const covered = Object.values(W02_ENUM_SPECS).map((spec) => `${spec.message}.${spec.field}`);
    expect([...new Set(covered)].sort()).toEqual([...protoW02EnumFields()].sort());
  });

  it.each(Object.keys(W02_ENUM_SPECS))('%s: values equal OpenAPI R2', (key) => {
    expect(adapters[key].apiValues).toEqual(openApi.get(key));
  });

  it.each(Object.keys(W02_ENUM_SPECS))(
    '%s: every value round-trips through the wire name',
    (key) => {
      const adapter = adapters[key];
      for (const value of adapter.apiValues) {
        const wire = adapter.toWire(value);
        expect(wire.startsWith(adapter.prefix)).toBe(true);
        expect(adapter.toApi(wire)).toBe(value);
      }
    },
  );

  it.each(Object.entries(STRING_ON_WIRE))(
    '%s stays a plain string in the proto (no prefixed enum)',
    (location, { message, field }) => {
      const descriptor = getStorageProto()[`${STORAGE_PACKAGE}.${message}`].type as {
        field: FieldDescriptor[];
      };
      expect(descriptor.field.find((candidate) => candidate.name === field)?.type).toBe(
        'TYPE_STRING',
      );
      expect(openApi.get(location)).toEqual(adapters['FileMetadata.purpose'].apiValues);
    },
  );

  it('maps the documented examples', () => {
    expect(adapters['Role.family'].toWire('ADMIN')).toBe('FAMILY_ADMIN');
    expect(adapters['RoleWrite.family'].toApi('FAMILY_SUPERVISOR')).toBe('SUPERVISOR');
    expect(adapters['Job.status'].toApi('STATUS_QUEUED')).toBe('QUEUED');
    expect(adapters['FileMetadata.status'].toWire('REJECTED')).toBe('STATUS_REJECTED');
    expect(adapters['listUsers?sortBy'].toWire('createdAt')).toBe('SORT_BY_CREATEDAT');
    expect(adapters['listUsers?sortBy'].toApi('SORT_BY_CREATEDAT')).toBe('createdAt');
  });

  describe('unknown values are errors, never passed through', () => {
    const family = () => w02EnumAdapter('Role.family');

    it.each(['admin', 'FAMILY_ADMIN', '', 'OWNER', 1, null, undefined])(
      'toWire(%p) throws',
      (value) => {
        expect(() => family().toWire(value)).toThrow(StorageEnumMappingError);
      },
    );

    it.each(['ADMIN', 'FAMILY_UNSPECIFIED', 'FAMILY_OWNER', 'family_admin', 0, undefined])(
      'toApi(%p) throws',
      (value) => {
        expect(() => family().toApi(value)).toThrow(StorageEnumMappingError);
      },
    );

    it('RoleWrite.family refuses ADMIN (OpenAPI only allows MANAGER/SUPERVISOR)', () => {
      expect(() => w02EnumAdapter('RoleWrite.family').toWire('ADMIN')).toThrow(
        StorageEnumMappingError,
      );
    });

    it('names the enum and direction, not the offending value', () => {
      expect(() => family().toApi('<script>')).toThrow(
        'Unmapped value for warehouse.storage.v1.Role.FamilyEnum (toApi)',
      );
    });

    it('throws for an unknown adapter key', () => {
      expect(() => w02EnumAdapter('Role.colour')).toThrow(RangeError);
    });
  });

  describe('contract drift is detected at construction', () => {
    const definition = loadStorageProto();

    it('rejects an OpenAPI value that has no proto value', () => {
      expect(
        () =>
          new StorageEnumAdapter(definition, {
            message: 'Role',
            field: 'family',
            apiValues: ['ADMIN', 'MANAGER', 'SUPERVISOR', 'OWNER'],
          }),
      ).toThrow(StorageEnumContractError);
    });

    it('rejects a proto value missing from OpenAPI', () => {
      expect(
        () =>
          new StorageEnumAdapter(definition, {
            message: 'Role',
            field: 'family',
            apiValues: ['ADMIN', 'MANAGER'],
          }),
      ).toThrow(StorageEnumContractError);
    });

    it('rejects two OpenAPI values that collapse to the same wire name', () => {
      expect(
        () =>
          new StorageEnumAdapter(definition, {
            message: 'RoleWrite',
            field: 'family',
            apiValues: ['MANAGER', 'manager', 'SUPERVISOR'],
          }),
      ).toThrow(StorageEnumContractError);
    });

    it('rejects a non-enum field and an unknown message', () => {
      expect(
        () => new StorageEnumAdapter(definition, { message: 'Job', field: 'kind', apiValues: [] }),
      ).toThrow(StorageEnumContractError);
      expect(
        () => new StorageEnumAdapter(definition, { message: 'Nope', field: 'x', apiValues: [] }),
      ).toThrow(StorageEnumContractError);
    });
  });
});
