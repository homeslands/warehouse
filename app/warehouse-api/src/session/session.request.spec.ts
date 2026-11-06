import { SessionException } from './session.exception';
import {
  parseLoginInput,
  parsePasswordChangeInput,
  parseSessionId,
  parseSessionListQuery,
} from './session.request';
import { SessionFieldErrorKey, SessionValidation } from './session.validation';

function fieldKeys(run: () => unknown): string[] {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(SessionException);
    const exception = error as SessionException;
    expect(exception.error).toBe(SessionValidation.SESSION_REQUEST_INVALID);
    expect(exception.error.code).toBe(118216);
    expect(exception.error.statusCode).toBe(422);
    return exception.fieldErrors.map((item) => `${item.field}:${item.errorKey}`);
  }
  throw new Error('expected a SessionException');
}

describe('session request parsing (Storage-side validation)', () => {
  it('parses a valid login and rejects missing/oversized fields', () => {
    expect(parseLoginInput({ phoneNumber: '0900000001', password: 'secret' })).toEqual({
      phoneNumber: '0900000001',
      password: 'secret',
    });
    expect(fieldKeys(() => parseLoginInput({}))).toEqual([
      `phoneNumber:${SessionFieldErrorKey.PHONE_NUMBER_REQUIRED}`,
      `password:${SessionFieldErrorKey.PASSWORD_REQUIRED}`,
    ]);
    expect(
      fieldKeys(() => parseLoginInput({ phoneNumber: '1'.repeat(33), password: 'p'.repeat(129) })),
    ).toEqual([
      `phoneNumber:${SessionFieldErrorKey.PHONE_NUMBER_TOO_LONG}`,
      `password:${SessionFieldErrorKey.PASSWORD_TOO_LONG}`,
    ]);
    expect(fieldKeys(() => parseLoginInput(undefined))).toHaveLength(2);
  });

  it('validates PasswordChange with the 12..72 byte rule', () => {
    expect(
      parsePasswordChangeInput({ currentPassword: 'old', newPassword: 'new-password-12' }),
    ).toEqual({ currentPassword: 'old', newPassword: 'new-password-12' });
    expect(fieldKeys(() => parsePasswordChangeInput({ newPassword: 'é'.repeat(37) }))).toEqual([
      `currentPassword:${SessionFieldErrorKey.CURRENT_PASSWORD_REQUIRED}`,
      `newPassword:${SessionFieldErrorKey.NEW_PASSWORD_TOO_LONG}`,
    ]);
  });

  describe('parseSessionListQuery', () => {
    it('defaults to page 1, pageSize 20, createdAt DESC', () => {
      expect(parseSessionListQuery({})).toEqual({ page: 1, pageSize: 20, sort: 'DESC' });
    });

    it('reads int64 strings from proto and the prefixed enum names', () => {
      expect(
        parseSessionListQuery({
          page: '2',
          pageSize: '100',
          sortBy: 'SORT_BY_CREATEDAT',
          sort: 'SORT_ASC',
          q: '',
        }),
      ).toEqual({ page: 2, pageSize: 100, sort: 'ASC' });
    });

    it('rejects out-of-range paging, unsupported sortBy/q and invalid sort', () => {
      expect(
        fieldKeys(() =>
          parseSessionListQuery({
            page: '0',
            pageSize: '101',
            sortBy: 'SORT_BY_NAME',
            sort: 'SORT_UNSPECIFIED',
            q: 'chrome',
          }),
        ),
      ).toEqual([
        `page:${SessionFieldErrorKey.PAGE_INVALID}`,
        `pageSize:${SessionFieldErrorKey.PAGE_SIZE_INVALID}`,
        `q:${SessionFieldErrorKey.QUERY_UNSUPPORTED}`,
        `sortBy:${SessionFieldErrorKey.SORT_BY_UNSUPPORTED}`,
        `sort:${SessionFieldErrorKey.SORT_INVALID}`,
      ]);
      expect(fieldKeys(() => parseSessionListQuery({ page: '1e3' }))).toEqual([
        `page:${SessionFieldErrorKey.PAGE_INVALID}`,
      ]);
      expect(fieldKeys(() => parseSessionListQuery({ page: '99999999999999999999' }))).toEqual([
        `page:${SessionFieldErrorKey.PAGE_INVALID}`,
      ]);
    });
  });

  it('accepts only UUID session ids', () => {
    expect(parseSessionId('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe(
      '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    );
    expect(fieldKeys(() => parseSessionId('../other'))).toEqual([
      `id:${SessionFieldErrorKey.SESSION_ID_INVALID}`,
    ]);
    expect(fieldKeys(() => parseSessionId(undefined))).toHaveLength(1);
  });
});
