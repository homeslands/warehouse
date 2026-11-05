import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BaseQueryDto, MAX_PAGE_SIZE } from './base.dto';
import { AppValidation } from './app.validation';
import { GetAllImportFormRequestDto } from 'src/import-form/import-form.dto';

const messagesOf = <T extends object>(cls: new () => T, payload: object, property: string) =>
  validateSync(plainToInstance(cls, payload), { whitelist: true })
    .filter((e) => e.property === property)
    .flatMap((e) => Object.values(e.constraints ?? {}));

// Query string luôn tới dưới dạng chuỗi; `@Type(() => Number)` đổi sang số trước khi validate.
const INVALID_VALUES: [string, unknown][] = [
  ['0', '0'],
  ['negative', '-1'],
  ['not an integer', '1.5'],
  ['not a number', 'abc'],
  ['empty string', ''],
  ['number 0', 0],
];

describe.each([
  ['page', 'PAGE_INVALID'],
  ['size', 'SIZE_INVALID'],
])('BaseQueryDto.%s', (field, key) => {
  it('is registered in AppValidation as 422', () => {
    expect(AppValidation[key]).toMatchObject({ statusCode: 422 });
  });

  it.each(INVALID_VALUES)(`rejects %s with ${key}`, (_label, value) => {
    const messages = messagesOf(BaseQueryDto, { [field]: value }, field);
    expect(messages).not.toEqual([]);
    // Mọi validator của field dùng chung 1 key ⇒ `message[0]` mà filter tra luôn là key này.
    expect(new Set(messages)).toEqual(new Set([key]));
  });

  it.each([
    ['1', 1],
    ['25', 25],
  ])('accepts %s', (value, expected) => {
    const dto = plainToInstance(BaseQueryDto, { [field]: value });
    expect(validateSync(dto, { whitelist: true })).toEqual([]);
    expect(dto[field as 'page' | 'size']).toBe(expected);
  });

  // Query DTO của từng module kế thừa `BaseQueryDto` ⇒ nhận cùng key.
  it(`applies ${key} to subclasses (GetAllImportFormRequestDto)`, () => {
    expect(messagesOf(GetAllImportFormRequestDto, { [field]: '0' }, field)).toEqual([key]);
  });
});

// Issue #179: `size` ≤ `MAX_PAGE_SIZE` (500); biên 500 qua, 501 chặn bằng cùng key SIZE_INVALID.
describe('BaseQueryDto.size upper bound (issue #179)', () => {
  it.each([
    ['500', '500', 500],
    ['number 500', 500, 500],
  ])('accepts %s', (_label, value, expected) => {
    const dto = plainToInstance(BaseQueryDto, { size: value });
    expect(validateSync(dto, { whitelist: true })).toEqual([]);
    expect(dto.size).toBe(expected);
  });

  it.each([
    ['501', '501'],
    ['number 501', 501],
    ['1000000000', '1000000000'],
  ])('rejects %s with SIZE_INVALID', (_label, value) => {
    expect(messagesOf(BaseQueryDto, { size: value }, 'size')).toEqual(['SIZE_INVALID']);
  });

  it('caps at MAX_PAGE_SIZE = 500', () => {
    expect(MAX_PAGE_SIZE).toBe(500);
  });

  it('applies the cap to subclasses (GetAllImportFormRequestDto)', () => {
    expect(messagesOf(GetAllImportFormRequestDto, { size: '501' }, 'size')).toEqual([
      'SIZE_INVALID',
    ]);
  });
});

// Issue #179: 4 key date/sort chuyển 400 → 422 (mặc định `createErrorCode`), giữ code + message.
describe('BaseQueryDto date/sort error codes (issue #179)', () => {
  it.each([
    ['START_DATE_INVALID', 100850, 'startDate must be a valid date (YYYY-MM-DD or ISO 8601)'],
    ['END_DATE_INVALID', 100851, 'endDate must be a valid date (YYYY-MM-DD or ISO 8601)'],
    ['SORT_INVALID', 100852, 'sort must be ASC or DESC'],
    ['SORT_BY_INVALID', 100853, 'sortBy is not supported by this endpoint'],
  ])('%s is %d / 422 with the unchanged message', (key, code, message) => {
    expect(AppValidation[key]).toEqual({ code, message, statusCode: 422 });
  });
});

describe('BaseQueryDto defaults', () => {
  it('keeps page = 1 and size = 10 when omitted', () => {
    const dto = plainToInstance(BaseQueryDto, {});
    expect(validateSync(dto, { whitelist: true })).toEqual([]);
    expect(dto).toMatchObject({ page: 1, size: 10 });
  });
});

describe('Error codes of BaseQueryDto page/size', () => {
  it('uses distinct codes in the shared 1008(5x) range', () => {
    expect(AppValidation.PAGE_INVALID.code).toBe(100854);
    expect(AppValidation.SIZE_INVALID.code).toBe(100855);
  });
});
