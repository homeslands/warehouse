import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BaseQueryDto } from './base.dto';
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
