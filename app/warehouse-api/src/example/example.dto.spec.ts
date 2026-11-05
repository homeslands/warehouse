import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateExampleRequestDto } from './example.dto';

const messagesFor = <T extends object>(cls: new () => T, payload: object): string[] => {
  const dto = plainToInstance(cls, payload);
  const error = validateSync(dto, { whitelist: true }).find((e) => e.property === 'version');
  return Object.values(error?.constraints ?? {});
};

/**
 * `version: 0` là lỗ hổng thật, không phải case lý thuyết: TypeORM bọc cả khối so sánh version của
 * optimistic lock trong `if (... && this.expressionMap.lockVersion)` (`SelectQueryBuilder.js:691`),
 * `0` là falsy nên check bị bỏ qua hoàn toàn và `save()` ghi đè bất kể version trong DB. Chặn ở DTO
 * là rào duy nhất — không có lớp nào phía sau đỡ.
 */
describe('UpdateExampleRequestDto.version', () => {
  const payload = (version: unknown) => ({ ...{ name: 'Example A' }, version });

  it.each([1, 2, 99])('accepts version %i', (version) => {
    expect(messagesFor(UpdateExampleRequestDto, payload(version))).toEqual([]);
  });

  it('rejects 0 — giá trị bypass được optimistic lock của TypeORM', () => {
    expect(messagesFor(UpdateExampleRequestDto, payload(0))).toEqual(['EXAMPLE_VERSION_INVALID']);
  });

  // Mọi validator của `version` dùng chung 1 key ⇒ message đầu tiên (`HttpExceptionFilter` lấy
  // `message[0]`) luôn là key này, bất kể ràng buộc nào fail trước.
  it.each([
    ['negative', -1],
    ['float', 1.5],
    ['string', 'abc'],
    ['missing', undefined],
    ['null', null],
  ])('rejects %s with EXAMPLE_VERSION_INVALID', (_label, version) => {
    const messages = messagesFor(UpdateExampleRequestDto, payload(version));
    expect(messages).not.toEqual([]);
    expect(new Set(messages)).toEqual(new Set(['EXAMPLE_VERSION_INVALID']));
  });
});

describe('UpdateExampleRequestDto — PATCH partial', () => {
  const errorsFor = (payload: object) =>
    validateSync(plainToInstance(UpdateExampleRequestDto, payload), { whitelist: true });

  it('chấp nhận body chỉ có version (không đổi field nào)', () => {
    expect(errorsFor({ version: 1 })).toEqual([]);
  });

  it('chấp nhận body chỉ có description', () => {
    expect(errorsFor({ description: 'Mô tả mới', version: 1 })).toEqual([]);
  });
});
