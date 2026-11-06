import { validate as uuidValidate } from 'uuid';
import { V1FieldError } from 'src/shared/api-v1/envelope';
import { RbacFieldErrorKey, rbacInvalid } from './rbac-v1.validation';

/**
 * Validation phía Storage cho RPC RBAC v1 (business-rules: bắt buộc tại Storage, kể cả gọi trực tiếp RPC).
 * Nhận object proto đã decode (int64 = chuỗi, enum = tên proto có prefix, FieldMask `{ paths }`).
 */
type Raw = Record<string, unknown>;
const asRaw = (value: unknown): Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : {};
const fe = (field: string, errorKey: string, message: string): V1FieldError => ({
  field,
  errorKey,
  message,
});
function throwIfAny(errors: V1FieldError[]): void {
  if (errors.length) throw rbacInvalid(errors);
}

const POSITIVE_INTEGER = /^[1-9]\d{0,15}$/;
function readPositiveInt(value: unknown): number | undefined {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !POSITIVE_INTEGER.test(text)) return undefined;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function parseUuid(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !uuidValidate(value))
    throw rbacInvalid([fe(field, RbacFieldErrorKey.ID_INVALID, `${field} must be a UUID`)]);
  return value.toLowerCase();
}

export function parseVersion(value: unknown): number {
  const version = readPositiveInt(value);
  if (version === undefined)
    throw rbacInvalid([fe('version', RbacFieldErrorKey.VERSION_INVALID, 'version must be >= 1')]);
  return version;
}

/** OpenAPI `Authority.code` pattern. */
const AUTHORITY_CODE = /^[A-Z][A-Z0-9_]{1,79}$/;
export function parseAuthorityCode(value: unknown): string {
  if (typeof value !== 'string' || !AUTHORITY_CODE.test(value))
    throw rbacInvalid([
      fe('authorityCode', RbacFieldErrorKey.AUTHORITY_CODE_INVALID, 'authorityCode is invalid'),
    ]);
  return value;
}

export type ListSortBy = 'createdAt' | 'name' | 'code';
export interface ListQuery {
  page: number;
  pageSize: number;
  /** Đã chuẩn hoá NFC (business-rules §14). */
  q?: string;
  sortBy: ListSortBy;
  sort: 'ASC' | 'DESC';
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_QUERY_LENGTH = 200;
const SORT_BY: Record<string, ListSortBy> = {
  SORT_BY_CREATEDAT: 'createdAt',
  SORT_BY_NAME: 'name',
  SORT_BY_CODE: 'code',
};
const SORT: Record<string, 'ASC' | 'DESC'> = { SORT_ASC: 'ASC', SORT_DESC: 'DESC' };

/**
 * List v1: page ≥1, pageSize 1..100 (mặc định 20), q ≤200, sortBy whitelist theo resource (`supported`), mặc
 * định `createdAt DESC`. sortBy có trong enum chung nhưng resource không có field ⇒ 422 (vd role không có code).
 */
export function parseListQuery(raw: unknown, supported: readonly ListSortBy[]): ListQuery {
  const { page, pageSize, q, sortBy, sort } = asRaw(raw);
  const errors: V1FieldError[] = [];
  const paging = readPaging(page, pageSize, errors);
  const order = readOrder(sortBy, sort, supported, errors);
  if (q !== undefined && (typeof q !== 'string' || q.length > MAX_QUERY_LENGTH))
    errors.push(fe('q', RbacFieldErrorKey.QUERY_INVALID, 'q must be at most 200 characters'));
  throwIfAny(errors);
  const query: ListQuery = { ...paging, ...order };
  if (typeof q === 'string' && q.length) query.q = q.normalize('NFC');
  return query;
}

function readPaging(page: unknown, pageSize: unknown, errors: V1FieldError[]) {
  const pageValue = page === undefined ? 1 : readPositiveInt(page);
  if (pageValue === undefined)
    errors.push(fe('page', RbacFieldErrorKey.PAGE_INVALID, 'page must be >= 1'));
  const size = pageSize === undefined ? DEFAULT_PAGE_SIZE : readPositiveInt(pageSize);
  if (size === undefined || size > MAX_PAGE_SIZE)
    errors.push(fe('pageSize', RbacFieldErrorKey.PAGE_SIZE_INVALID, 'pageSize must be 1..100'));
  return { page: pageValue as number, pageSize: size as number };
}

function readOrder(
  sortBy: unknown,
  sort: unknown,
  supported: readonly ListSortBy[],
  errors: V1FieldError[],
): Pick<ListQuery, 'sortBy' | 'sort'> {
  const by = sortBy === undefined ? 'createdAt' : SORT_BY[sortBy as string];
  if (!by || !supported.includes(by))
    errors.push(fe('sortBy', RbacFieldErrorKey.SORT_BY_UNSUPPORTED, 'sortBy is not supported'));
  const direction = sort === undefined ? 'DESC' : SORT[sort as string];
  if (!direction)
    errors.push(fe('sort', RbacFieldErrorKey.SORT_INVALID, 'sort must be ASC or DESC'));
  return { sortBy: by as ListSortBy, sort: direction };
}

/** Kết quả parse PATCH: chỉ các field có trong `update_mask` (đường dẫn `data.<field>`, architecture). */
export interface PatchInput<TField extends string> {
  version: number;
  fields: Partial<Record<TField, string>>;
}

interface PatchRule<TField extends string> {
  field: TField;
  validate(value: unknown): boolean;
  errorKey: string;
  message: string;
}

/**
 * PATCH theo FieldMask (architecture "Wire contracts"): mask ⊆ whitelist, mỗi path phải có giá trị trong `data`
 * và ngược lại (không mâu thuẫn), không trùng. `clear_fields` phải rỗng vì các field cho phép đều không
 * nullable. Payload chỉ có version không phải update hợp lệ (business-rules) ⇒ 422.
 */
export function parsePatch<TField extends string>(
  request: unknown,
  rules: readonly PatchRule<TField>[],
): PatchInput<TField> {
  const raw = asRaw(request);
  const data = asRaw(raw.data);
  const paths = asRaw(raw.updateMask).paths;
  const clear = raw.clearFields;
  const errors: V1FieldError[] = [];
  const version = readPositiveInt(data.version);
  if (version === undefined)
    errors.push(fe('version', RbacFieldErrorKey.VERSION_INVALID, 'version must be >= 1'));
  const maskPaths = Array.isArray(paths) ? paths : [];
  const maskOk = isMaskConsistent(maskPaths, data, rules);
  if (!maskOk || (Array.isArray(clear) && clear.length))
    errors.push(
      fe('updateMask', RbacFieldErrorKey.UPDATE_MASK_INVALID, 'update mask does not match data'),
    );
  if (maskOk && !maskPaths.length)
    errors.push(fe('data', RbacFieldErrorKey.PATCH_EMPTY, 'at least one field must change'));
  const fields: Partial<Record<TField, string>> = {};
  for (const rule of rules) {
    const value = data[rule.field];
    if (value === undefined) continue;
    if (!rule.validate(value)) errors.push(fe(rule.field, rule.errorKey, rule.message));
    else fields[rule.field] = value as string;
  }
  throwIfAny(errors);
  return { version: version as number, fields };
}

function isMaskConsistent<TField extends string>(
  maskPaths: unknown[],
  data: Raw,
  rules: readonly PatchRule<TField>[],
): boolean {
  const allowed = new Set(rules.map((rule) => `data.${rule.field}`));
  return (
    maskPaths.every((path) => typeof path === 'string' && allowed.has(path)) &&
    new Set(maskPaths).size === maskPaths.length &&
    rules.every(
      (rule) => (data[rule.field] !== undefined) === maskPaths.includes(`data.${rule.field}`),
    )
  );
}

const isStringLength = (min: number, max: number) => (value: unknown) =>
  typeof value === 'string' && [...value].length >= min && [...value].length <= max;

/**
 * Giới hạn độ dài theo CỘT DB legacy khi chặt hơn OpenAPI: `description_column`/`name_column` VARCHAR(255)
 * trong khi OpenAPI `Role.description` cho 1000 ⇒ dùng 255 để không cắt/lỗi DB (DEV-197-21).
 */
const DB_VARCHAR = 255;
const ROLE_NAME_MAX = 100;
const ROLE_NAME_MIN = 2;

export const ROLE_PATCH_RULES: readonly PatchRule<'name' | 'description'>[] = [
  {
    field: 'name',
    validate: isStringLength(ROLE_NAME_MIN, ROLE_NAME_MAX),
    errorKey: RbacFieldErrorKey.NAME_INVALID,
    message: 'name must be 2..100 characters',
  },
  {
    field: 'description',
    validate: isStringLength(0, DB_VARCHAR),
    errorKey: RbacFieldErrorKey.DESCRIPTION_INVALID,
    message: 'description must be at most 255 characters',
  },
];

export const AUTHORITY_PATCH_RULES: readonly PatchRule<'name' | 'groupId'>[] = [
  {
    field: 'name',
    validate: isStringLength(1, DB_VARCHAR),
    errorKey: RbacFieldErrorKey.NAME_INVALID,
    message: 'name must be 1..255 characters',
  },
  {
    field: 'groupId',
    validate: (value) => typeof value === 'string' && uuidValidate(value),
    errorKey: RbacFieldErrorKey.GROUP_INVALID,
    message: 'groupId must be a UUID',
  },
];
