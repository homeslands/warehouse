import { toRole } from 'src/gateway/rbac/gateway-rbac.mapper';
import { RBAC_RPC_AUTHORITY } from 'src/grpc/storage/rbac/storage-rbac.handlers';
import { getStorageServiceDefinition } from 'src/grpc/storage-proto.runtime';
import {
  parseAuthorityCode,
  parseListQuery,
  parsePatch,
  parseVersion,
  ROLE_PATCH_RULES,
} from './rbac-v1.request';
import { RbacException, RbacValidation } from './rbac-v1.validation';
import { assertAuthorized, assertCanManageRole, V1Actor } from './v1-authorizer';

const actor = (overrides: Partial<V1Actor> = {}): V1Actor => ({
  userId: 'u',
  sessionId: 's',
  roleId: 'r',
  family: 'ADMIN',
  level: 30,
  authorityCodes: new Set(['ROLE_READ', 'MANAGE_PERMISSIONS']),
  ...overrides,
});

function errorOf(run: () => unknown): RbacException {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(RbacException);
    return error as RbacException;
  }
  throw new Error('expected RbacException');
}

describe('RBAC v1 core (W02 I-03a)', () => {
  describe('assertAuthorized: x-authority OR + family ceiling, no SUPER_ADMIN bypass (F-196-04)', () => {
    it('allows an ADMIN holding the code', () => {
      expect(() => assertAuthorized(actor(), ['ROLE_READ'])).not.toThrow();
      expect(() => assertAuthorized(actor(), ['USER_READ', 'ROLE_READ'])).not.toThrow();
    });

    it('denies a missing code, and an unresolved family even with every code (SUPER_ADMIN)', () => {
      expect(errorOf(() => assertAuthorized(actor(), ['ROLE_DELETE'])).error).toBe(
        RbacValidation.RBAC_PERMISSION_DENIED,
      );
      const superAdmin = actor({
        family: null,
        level: 100,
        authorityCodes: new Set(['ROLE_READ']),
      });
      expect(errorOf(() => assertAuthorized(superAdmin, ['ROLE_READ'])).error).toBe(
        RbacValidation.RBAC_FAMILY_UNRESOLVED,
      );
    });

    it('ignores a code the family may not hold even if it is in the DB (ceiling)', () => {
      const manager = actor({ family: 'MANAGER', authorityCodes: new Set(['ROLE_READ']) });
      expect(errorOf(() => assertAuthorized(manager, ['ROLE_READ'])).error.statusCode).toBe(403);
    });

    it('refuses an operation without x-authority (deny by design)', () => {
      expect(() => assertAuthorized(actor(), [])).toThrow(RangeError);
    });

    it('only manages roles strictly below the actor level', () => {
      expect(() => assertCanManageRole(actor(), { level: 20 })).not.toThrow();
      expect(errorOf(() => assertCanManageRole(actor(), { level: 30 })).error).toBe(
        RbacValidation.RBAC_ROLE_LEVEL_FORBIDDEN,
      );
    });

    it('annotates every RBAC RPC with an x-authority that exists in the proto', () => {
      const service = getStorageServiceDefinition();
      for (const [rpc, codes] of Object.entries(RBAC_RPC_AUTHORITY)) {
        expect(service[rpc]).toBeDefined();
        expect(codes.length).toBeGreaterThan(0);
      }
    });
  });

  describe('request parsing', () => {
    it('parses list queries with per-resource sortBy whitelist', () => {
      expect(
        parseListQuery({ page: '2', sortBy: 'SORT_BY_NAME', sort: 'SORT_ASC', q: 'Café' }, [
          'createdAt',
          'name',
        ]),
      ).toEqual({
        page: 2,
        pageSize: 20,
        sortBy: 'name',
        sort: 'ASC',
        q: 'Café',
      });
      const error = errorOf(() =>
        parseListQuery({ sortBy: 'SORT_BY_CODE', pageSize: '101' }, ['createdAt', 'name']),
      );
      expect(error.fieldErrors.map((item) => item.errorKey)).toEqual([
        'RBAC_PAGE_SIZE_INVALID',
        'RBAC_SORT_BY_UNSUPPORTED',
      ]);
    });

    it('parses a PATCH only when the FieldMask matches the data', () => {
      expect(
        parsePatch(
          {
            data: { version: '3', name: 'Kho phó' },
            updateMask: { paths: ['data.name'] },
            clearFields: [],
          },
          ROLE_PATCH_RULES,
        ),
      ).toEqual({ version: 3, fields: { name: 'Kho phó' } });
      const keys = (request: object) =>
        errorOf(() => parsePatch(request, ROLE_PATCH_RULES)).fieldErrors.map(
          (item) => item.errorKey,
        );
      // Chỉ có version ⇒ không phải update hợp lệ.
      expect(keys({ data: { version: '1' }, updateMask: { paths: [] } })).toEqual([
        'RBAC_PATCH_EMPTY',
      ]);
      // Mask có path ngoài whitelist / lệch data / clear_fields không rỗng.
      expect(
        keys({ data: { version: '1', name: 'ab' }, updateMask: { paths: ['data.family'] } }),
      ).toEqual(['RBAC_UPDATE_MASK_INVALID']);
      expect(keys({ data: { version: '1', name: 'ab' }, updateMask: { paths: [] } })).toEqual([
        'RBAC_UPDATE_MASK_INVALID',
      ]);
      expect(
        keys({
          data: { version: '1', name: 'ab' },
          updateMask: { paths: ['data.name'] },
          clearFields: ['description'],
        }),
      ).toEqual(['RBAC_UPDATE_MASK_INVALID']);
      expect(
        keys({
          data: { version: '0', description: 'x'.repeat(256) },
          updateMask: { paths: ['data.description'] },
        }),
      ).toEqual(['RBAC_VERSION_INVALID', 'RBAC_DESCRIPTION_INVALID']);
    });

    it('validates version and authority codes', () => {
      expect(parseVersion('7')).toBe(7);
      expect(() => parseVersion('0')).toThrow(RbacException);
      expect(parseAuthorityCode('ROLE_READ')).toBe('ROLE_READ');
      expect(() => parseAuthorityCode('role_read')).toThrow(RbacException);
    });
  });

  it('maps a proto Role to the OpenAPI Role with family without prefix', () => {
    expect(
      toRole({
        id: 'r',
        name: 'MANAGER',
        family: 'FAMILY_MANAGER',
        level: '20',
        builtIn: true,
        authorityCodes: ['A'],
        version: '2',
        highlights: [],
      }),
    ).toEqual({
      id: 'r',
      name: 'MANAGER',
      family: 'MANAGER',
      level: 20,
      builtIn: true,
      authorityCodes: ['A'],
      version: 2,
    });
    expect(() =>
      toRole({
        id: 'r',
        name: 'x',
        family: 'FAMILY_UNSPECIFIED',
        level: '1',
        builtIn: false,
        authorityCodes: [],
        version: '1',
      }),
    ).toThrow();
  });
});
