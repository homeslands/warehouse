import { validate as uuidValidate } from 'uuid';
import { V1FieldError } from 'src/shared/api-v1/envelope';
import {
  LIST_QUERY_MAX_LENGTH,
  LOGIN_PASSWORD_MAX_LENGTH,
  LOGIN_PHONE_MAX_LENGTH,
  SESSION_LIST_DEFAULT_PAGE_SIZE,
  SESSION_LIST_MAX_PAGE_SIZE,
} from './session.constants';
import { invalidRequest } from './session.exception';
import { fieldError, newPasswordErrors } from './session.policy';
import { SessionFieldErrorKey } from './session.validation';

/**
 * Validation đầu vào phía Storage cho các RPC phiên (business-rules: "bắt buộc tại Storage Service, kể cả
 * gọi trực tiếp RPC"). Nhận object đã decode từ proto (field camelCase, int64 là chuỗi do
 * `longs: String`, enum là tên proto có prefix). Lỗi ⇒ `SESSION_REQUEST_INVALID` + field errors (422).
 */

export interface LoginInput {
  phoneNumber: string;
  password: string;
}

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
}

export type SortDirection = 'ASC' | 'DESC';

export interface SessionListQuery {
  page: number;
  pageSize: number;
  sort: SortDirection;
}

type RawObject = Record<string, unknown>;

const asObject = (value: unknown): RawObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as RawObject) : {};

function throwIfAny(errors: V1FieldError[]): void {
  if (errors.length) throw invalidRequest(errors);
}

/** OpenAPI `Login`: phoneNumber minLength 1, password 1..128. */
export function parseLoginInput(data: unknown): LoginInput {
  const { phoneNumber, password } = asObject(data);
  const errors: V1FieldError[] = [];
  if (typeof phoneNumber !== 'string' || phoneNumber.length === 0)
    errors.push(
      fieldError(
        'phoneNumber',
        SessionFieldErrorKey.PHONE_NUMBER_REQUIRED,
        'Phone number is required',
      ),
    );
  else if (phoneNumber.length > LOGIN_PHONE_MAX_LENGTH)
    errors.push(
      fieldError(
        'phoneNumber',
        SessionFieldErrorKey.PHONE_NUMBER_TOO_LONG,
        'Phone number is too long',
      ),
    );
  if (typeof password !== 'string' || password.length === 0)
    errors.push(
      fieldError('password', SessionFieldErrorKey.PASSWORD_REQUIRED, 'Password is required'),
    );
  else if (password.length > LOGIN_PASSWORD_MAX_LENGTH)
    errors.push(
      fieldError(
        'password',
        SessionFieldErrorKey.PASSWORD_TOO_LONG,
        `Password must be at most ${LOGIN_PASSWORD_MAX_LENGTH} characters`,
      ),
    );
  throwIfAny(errors);
  return { phoneNumber: phoneNumber as string, password: password as string };
}

/** OpenAPI `PasswordChange` + business-rules §16 (12 ký tự .. 72 byte UTF-8). */
export function parsePasswordChangeInput(data: unknown): PasswordChangeInput {
  const { currentPassword, newPassword } = asObject(data);
  const errors: V1FieldError[] = [];
  if (typeof currentPassword !== 'string' || currentPassword.length === 0)
    errors.push(
      fieldError(
        'currentPassword',
        SessionFieldErrorKey.CURRENT_PASSWORD_REQUIRED,
        'Current password is required',
      ),
    );
  errors.push(...newPasswordErrors('newPassword', newPassword));
  throwIfAny(errors);
  return { currentPassword: currentPassword as string, newPassword: newPassword as string };
}

const POSITIVE_INTEGER = /^[1-9]\d{0,15}$/;

/** int64 proto (chuỗi do `longs: String`, hoặc number) → số nguyên dương an toàn; sai ⇒ `undefined`. */
function readPositiveInt(value: unknown): number | undefined {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !POSITIVE_INTEGER.test(text)) return undefined;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

const SORT_BY_CREATED_AT = 'SORT_BY_CREATEDAT';
/** Giá trị có trong enum OpenAPI/proto nhưng phiên không có field tương ứng (Q-I02-04). */
const UNSUPPORTED_SORT_BY = new Set(['SORT_BY_CODE', 'SORT_BY_NAME']);
const SORT_DIRECTIONS: Record<string, SortDirection> = { SORT_ASC: 'ASC', SORT_DESC: 'DESC' };

/**
 * `ListOwnSessionsRequest`. Mặc định page 1, pageSize 20, sắp `createdAt DESC`.
 * - `sortBy`: chỉ `createdAt`. `code`/`name` có trong enum chung của OpenAPI nhưng `Session` không có field
 *   đó ⇒ 422 thay vì tự chọn cột thay thế (Q-I02-04).
 * - `q`: OpenAPI không nói tìm trên field nào của `Session` ⇒ `q` khác rỗng bị 422 (Q-I02-04); vẫn kiểm ≤200.
 */
export function parseSessionListQuery(raw: unknown): SessionListQuery {
  const { page, pageSize, q, sortBy, sort } = asObject(raw);
  const errors: V1FieldError[] = [];
  const paging = readPaging(page, pageSize, errors);
  const direction = readSort(q, sortBy, sort, errors);
  throwIfAny(errors);
  return { ...paging, sort: direction };
}

function readPaging(
  page: unknown,
  pageSize: unknown,
  errors: V1FieldError[],
): { page: number; pageSize: number } {
  const pageValue = page === undefined ? 1 : readPositiveInt(page);
  if (pageValue === undefined)
    errors.push(fieldError('page', SessionFieldErrorKey.PAGE_INVALID, 'page must be >= 1'));
  const sizeValue =
    pageSize === undefined ? SESSION_LIST_DEFAULT_PAGE_SIZE : readPositiveInt(pageSize);
  if (sizeValue === undefined || sizeValue > SESSION_LIST_MAX_PAGE_SIZE)
    errors.push(
      fieldError(
        'pageSize',
        SessionFieldErrorKey.PAGE_SIZE_INVALID,
        `pageSize must be between 1 and ${SESSION_LIST_MAX_PAGE_SIZE}`,
      ),
    );
  return { page: pageValue as number, pageSize: sizeValue as number };
}

function readSort(
  q: unknown,
  sortBy: unknown,
  sort: unknown,
  errors: V1FieldError[],
): SortDirection {
  const isEmptyQuery = q === undefined || q === '';
  if (!isEmptyQuery)
    errors.push(
      fieldError(
        'q',
        SessionFieldErrorKey.QUERY_UNSUPPORTED,
        typeof q === 'string' && q.length > LIST_QUERY_MAX_LENGTH
          ? `q must be at most ${LIST_QUERY_MAX_LENGTH} characters`
          : 'Search is not supported for sessions',
      ),
    );
  if (sortBy !== undefined && sortBy !== SORT_BY_CREATED_AT)
    errors.push(
      fieldError(
        'sortBy',
        SessionFieldErrorKey.SORT_BY_UNSUPPORTED,
        UNSUPPORTED_SORT_BY.has(sortBy as string)
          ? 'Sessions can only be sorted by createdAt'
          : 'sortBy is invalid',
      ),
    );
  const direction = sort === undefined ? 'DESC' : SORT_DIRECTIONS[sort as string];
  if (!direction)
    errors.push(fieldError('sort', SessionFieldErrorKey.SORT_INVALID, 'sort must be ASC or DESC'));
  return direction;
}

/** `RevokeOwnSessionRequest.id`: UUID. */
export function parseSessionId(value: unknown): string {
  if (typeof value !== 'string' || !uuidValidate(value))
    throw invalidRequest([
      fieldError('id', SessionFieldErrorKey.SESSION_ID_INVALID, 'id must be a UUID'),
    ]);
  return value.toLowerCase();
}
