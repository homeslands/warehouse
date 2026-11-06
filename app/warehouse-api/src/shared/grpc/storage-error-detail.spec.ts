import {
  decodeStorageErrorDetail,
  encodeStorageErrorDetail,
  parseStorageErrorDetail,
  STORAGE_ERROR_DETAIL_LIMITS,
  StorageErrorDetail,
} from './storage-error-detail';

const VALID: StorageErrorDetail = {
  statusCode: 422,
  code: 100_002,
  errorKey: 'ROLE_NAME_INVALID',
  message: 'Tên vai trò không hợp lệ',
  errors: [{ field: 'data.name', errorKey: 'ROLE_NAME_INVALID', message: 'Bắt buộc' }],
};
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8');

describe('Storage error detail (warehouse-error-bin)', () => {
  it('round-trips through encode/decode, int64 as proto3 JSON strings', () => {
    const encoded = encodeStorageErrorDetail(VALID);
    expect(JSON.parse(encoded.toString('utf8'))).toMatchObject({
      code: '100002',
      statusCode: '422',
    });
    expect(decodeStorageErrorDetail([encoded])).toEqual(VALID);
  });

  it('accepts integer numbers for int64 fields and an absent errors list', () => {
    expect(decodeStorageErrorDetail([bytes({ code: 7, errorKey: 'X_Y' })])).toEqual({
      code: 7,
      errorKey: 'X_Y',
      errors: [],
    });
  });

  it('ignores traceId/timestamp of the proto Error but keeps them allowed', () => {
    const detail = parseStorageErrorDetail({
      code: '1',
      errorKey: 'A',
      traceId: 'whatever',
      timestamp: 'x',
    });
    expect(detail).toEqual({ code: 1, errorKey: 'A', errors: [] });
  });

  it.each<[string, unknown]>([
    ['unknown key', { code: 1, errorKey: 'A', stack: 'at x' }],
    ['missing code', { errorKey: 'A' }],
    ['zero code', { code: 0, errorKey: 'A' }],
    ['float code', { code: 1.5, errorKey: 'A' }],
    ['non-numeric code string', { code: '12a', errorKey: 'A' }],
    ['lower-case errorKey', { code: 1, errorKey: 'role_invalid' }],
    ['errorKey with spaces', { code: 1, errorKey: 'A B' }],
    ['statusCode out of range', { code: 1, errorKey: 'A', statusCode: 200 }],
    ['empty message', { code: 1, errorKey: 'A', message: '' }],
    ['message with CR/LF', { code: 1, errorKey: 'A', message: 'x\r\ny' }],
    ['message too long', { code: 1, errorKey: 'A', message: 'm'.repeat(501) }],
    ['errors not an array', { code: 1, errorKey: 'A', errors: {} }],
    [
      'field error missing message',
      { code: 1, errorKey: 'A', errors: [{ field: 'f', errorKey: 'B' }] },
    ],
    [
      'field error with extra key',
      { code: 1, errorKey: 'A', errors: [{ field: 'f', errorKey: 'B', message: 'm', x: 1 }] },
    ],
    [
      'too many field errors',
      {
        code: 1,
        errorKey: 'A',
        errors: Array.from({ length: STORAGE_ERROR_DETAIL_LIMITS.maxFieldErrors + 1 }, () => ({
          field: 'f',
          errorKey: 'B',
          message: 'm',
        })),
      },
    ],
    ['array root', [{ code: 1, errorKey: 'A' }]],
  ])('rejects the whole detail on %s', (_label, value) => {
    expect(parseStorageErrorDetail(value)).toBeUndefined();
    expect(decodeStorageErrorDetail([bytes(value)])).toBeUndefined();
  });

  it.each<[string, Array<string | Buffer>]>([
    ['no value', []],
    ['two values', [bytes({ code: 1, errorKey: 'A' }), bytes({ code: 1, errorKey: 'A' })]],
    ['a text value', ['{"code":1,"errorKey":"A"}']],
    ['broken JSON', [Buffer.from('{"code":')]],
    ['oversized buffer', [Buffer.alloc(STORAGE_ERROR_DETAIL_LIMITS.maxBytes + 1, 0x20)]],
  ])('decodes %s as no detail', (_label, values) => {
    expect(decodeStorageErrorDetail(values)).toBeUndefined();
  });

  it('refuses to encode an invalid detail on the Storage side', () => {
    expect(() => encodeStorageErrorDetail({ ...VALID, errorKey: 'bad key' })).toThrow(RangeError);
  });
});
