import { validate as uuidValidate } from 'uuid';
import { v1Error, v1Success } from './envelope';
import { normalizeTraceId } from './trace-id';

const TRACE = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const NOW = new Date('2026-11-06T01:00:00.000Z');

describe('normalizeTraceId', () => {
  it('keeps a valid UUID, trimmed and lower-cased', () => {
    expect(normalizeTraceId(` ${TRACE.toUpperCase()} `)).toBe(TRACE);
  });

  it.each([undefined, null, 42, '', 'not-a-uuid', `${TRACE}\r\nforged`, 'x'.repeat(500)])(
    'replaces %p with a fresh UUID',
    (incoming) => {
      const result = normalizeTraceId(incoming);
      expect(uuidValidate(result)).toBe(true);
      expect(result).not.toBe(incoming);
    },
  );
});

describe('v1 envelope', () => {
  it('builds the success envelope with every required field', () => {
    expect(v1Success({ id: 'u1' }, TRACE, 'Retrieved', 200, NOW)).toEqual({
      message: 'Retrieved',
      statusCode: 200,
      timestamp: '2026-11-06T01:00:00.000Z',
      traceId: TRACE,
      result: { id: 'u1' },
    });
  });

  it('rejects a non-2xx success status', () => {
    expect(() => v1Success(null, TRACE, 'x', 404)).toThrow(RangeError);
  });

  it('builds the error envelope and omits an empty errors list', () => {
    const envelope = v1Error(
      {
        statusCode: 409,
        code: 100001,
        errorKey: 'VERSION_CONFLICT',
        message: 'Conflict',
        traceId: TRACE,
        errors: [],
      },
      NOW,
    );
    expect(envelope).toEqual({
      statusCode: 409,
      code: 100001,
      errorKey: 'VERSION_CONFLICT',
      message: 'Conflict',
      traceId: TRACE,
      timestamp: '2026-11-06T01:00:00.000Z',
    });
    expect(envelope).not.toHaveProperty('errors');
  });

  it('keeps field errors under `errors`, the name used by OpenAPI/proto', () => {
    const errors = [{ field: 'data.email', errorKey: 'EMAIL_INVALID', message: 'Invalid' }];
    expect(
      v1Error(
        {
          statusCode: 422,
          code: 1,
          errorKey: 'VALIDATION',
          message: 'Invalid',
          traceId: TRACE,
          errors,
        },
        NOW,
      ).errors,
    ).toEqual(errors);
  });

  it('rejects a non-error status', () => {
    expect(() =>
      v1Error({ statusCode: 200, code: 1, errorKey: 'X', message: 'x', traceId: TRACE }),
    ).toThrow(RangeError);
  });
});
