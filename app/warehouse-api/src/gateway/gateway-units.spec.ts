import { ValidationPipe } from '@nestjs/common';
import { AppValidation } from 'src/app/app.validation';
import { createErrorCode } from 'src/app/error-code.util';
import {
  GatewayMappingError,
  toActionResult,
  toLoginResult,
  toSessionPage,
} from './auth/gateway-auth.mapper';
import {
  V1ListOwnSessionsQueryDto,
  V1LoginDto,
  V1PasswordChangeDto,
} from './auth/gateway-auth.dto';
import { GatewayException } from './gateway.exception';
import { normalizeClientIp } from './gateway-request';
import { InMemoryFixedWindowRateLimiter } from './in-memory-rate-limiter';
import {
  assertUniqueErrorCodes,
  DuplicateErrorCodeError,
  V1_ERROR_CODE_REGISTRIES,
} from './v1-error-codes';
import { V1_VALIDATION_OPTIONS, V1UuidPipe } from './v1-validation';

class ManualClock {
  private current = new Date('2026-11-06T03:00:00.000Z');
  now() {
    return new Date(this.current.getTime());
  }
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

describe('Gateway v1 units (W02 I-02b)', () => {
  describe('error code registry (DEV-197-04)', () => {
    it('v1 ranges 1180xx/1181xx/1182xx/1183xx are unique against each other and AppValidation', () => {
      const total = assertUniqueErrorCodes(V1_ERROR_CODE_REGISTRIES);
      const v1Count = Object.values(V1_ERROR_CODE_REGISTRIES).reduce(
        (sum, registry) => sum + Object.keys(registry).length,
        0,
      );
      expect(total).toBe(Object.keys(AppValidation).length + v1Count);
    });

    it('detects a duplicate code or key', () => {
      const clash = { X_NEW: createErrorCode(118201, 'dup') };
      expect(() => assertUniqueErrorCodes({ ...V1_ERROR_CODE_REGISTRIES, clash })).toThrow(
        DuplicateErrorCodeError,
      );
      const [legacyKey] = Object.keys(AppValidation);
      const keyClash = { [legacyKey]: createErrorCode(999_999_001, 'dup key') };
      expect(() => assertUniqueErrorCodes({ keyClash })).toThrow(DuplicateErrorCodeError);
    });
  });

  it('normalizes client IPs (IPv4-mapped, invalid)', () => {
    expect(normalizeClientIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeClientIp('2001:db8::1')).toBe('2001:db8::1');
    expect(normalizeClientIp('fe80::1%eth0')).toBeUndefined();
    expect(normalizeClientIp(undefined)).toBeUndefined();
    expect(normalizeClientIp('1.2.3.4, 5.6.7.8')).toBeUndefined();
  });

  it('InMemoryFixedWindowRateLimiter: fixed window, reset after window, bounded keys fail closed', async () => {
    const clock = new ManualClock();
    const limiter = new InMemoryFixedWindowRateLimiter(clock, 2);
    const rule = { limit: 2, windowMs: 1_000 };
    expect(await limiter.hit('a', rule)).toBe(true);
    expect(await limiter.hit('a', rule)).toBe(true);
    expect(await limiter.hit('a', rule)).toBe(false);
    expect(await limiter.hit('b', rule)).toBe(true);
    expect(await limiter.hit('c', rule)).toBe(false); // trần 2 key, chưa key nào hết hạn
    clock.advance(1_000);
    expect(await limiter.hit('a', rule)).toBe(true);
    expect(await limiter.hit('c', rule)).toBe(true); // key hết hạn đã được dọn
  });

  describe('mapper (DEV-197-12: only fields with a source)', () => {
    it('maps LoginResult with expiresIn 900 and drops unsourced user arrays', () => {
      const result = toLoginResult(
        {
          accessToken: 'a.b.c',
          sessionId: 'sid',
          user: {
            id: 'u',
            phoneNumber: '0900000001',
            isActive: true,
            warehouseIds: [],
            highlights: [],
          },
        },
        'csrf',
      );
      expect(result).toEqual({
        accessToken: 'a.b.c',
        expiresIn: 900,
        user: { id: 'u', phoneNumber: '0900000001', isActive: true },
        sessionId: 'sid',
        csrfToken: 'csrf',
      });
    });

    it('maps ActionResult/Session page and refuses incomplete Storage data', () => {
      expect(
        toActionResult({ id: 'x', version: '3', status: 'REVOKED', traceId: 'ignored' }, 't'),
      ).toEqual({
        id: 'x',
        version: 3,
        status: 'REVOKED',
        traceId: 't',
      });
      const page = toSessionPage({
        page: '1',
        pageSize: '20',
        total: '1',
        totalPages: '1',
        hasNext: false,
        hasPrevious: false,
        items: [
          {
            id: 's',
            isCurrent: true,
            createdAt: 'c',
            lastInteractiveAt: 'l',
            idleExpiresAt: 'i',
            expiresAt: 'e',
            extra: 'dropped',
          },
        ],
      });
      expect(page.items[0]).not.toHaveProperty('extra');
      expect(page).toMatchObject({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
      expect(() => toActionResult({ id: 'x', status: 'S' }, 't')).toThrow(GatewayMappingError);
      expect(() => toLoginResult({ accessToken: 'a' }, 'c')).toThrow(GatewayMappingError);
    });
  });

  describe('v1 validation (OpenAPI additionalProperties:false, 12..72 bytes)', () => {
    const pipe = new ValidationPipe(V1_VALIDATION_OPTIONS);
    async function fieldErrors(
      metatype: new () => object,
      value: unknown,
      type: 'body' | 'query' = 'body',
    ) {
      try {
        await pipe.transform(value, { type, metatype });
      } catch (error) {
        expect(error).toBeInstanceOf(GatewayException);
        const exception = error as GatewayException;
        expect(exception.error.errorKey).toBe('GATEWAY_REQUEST_INVALID');
        return exception.fieldErrors.map((item) => `${item.field}:${item.errorKey}`);
      }
      return [];
    }

    it('rejects unknown and missing properties with key-based field errors', async () => {
      expect(
        await fieldErrors(V1LoginDto, { phoneNumber: '1', password: 'p', role: 'ADMIN' }),
      ).toEqual(['role:GATEWAY_PROPERTY_NOT_ALLOWED']);
      expect(await fieldErrors(V1LoginDto, {})).toEqual([
        'phoneNumber:SESSION_PHONE_NUMBER_REQUIRED',
        'password:SESSION_PASSWORD_REQUIRED',
      ]);
      expect(
        await fieldErrors(V1LoginDto, { phoneNumber: '1', password: 'p', 'a b<script>': 1 }),
      ).toEqual(['(unknown):GATEWAY_PROPERTY_NOT_ALLOWED']);
    });

    it('applies the password byte rule at the edge', async () => {
      expect(
        await fieldErrors(V1PasswordChangeDto, {
          currentPassword: 'x',
          newPassword: 'é'.repeat(37),
        }),
      ).toEqual(['newPassword:SESSION_NEW_PASSWORD_TOO_LONG']);
      expect(
        await fieldErrors(V1PasswordChangeDto, {
          currentPassword: 'x',
          newPassword: 'é'.repeat(36),
        }),
      ).toEqual([]);
    });

    it('validates list query paging and enums', async () => {
      expect(
        await fieldErrors(
          V1ListOwnSessionsQueryDto,
          { page: '0', pageSize: '101', sort: 'UP' },
          'query',
        ),
      ).toEqual([
        'page:SESSION_PAGE_INVALID',
        'pageSize:SESSION_PAGE_SIZE_INVALID',
        'sort:SESSION_SORT_INVALID',
      ]);
      expect(
        await fieldErrors(V1ListOwnSessionsQueryDto, { page: '2', sortBy: 'createdAt' }, 'query'),
      ).toEqual([]);
    });

    it('V1UuidPipe accepts UUIDs only', () => {
      const pipe2 = new V1UuidPipe();
      expect(pipe2.transform('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe(
        '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      );
      expect(() => pipe2.transform('x')).toThrow(GatewayException);
    });
  });
});
