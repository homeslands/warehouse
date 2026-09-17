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
    // `example` là module mẫu, cố ý không gắn message key nên `HttpExceptionFilter` không tra được
    // mã lỗi và trả nguyên message thô của class-validator — khác 4 module nghiệp vụ.
    expect(messagesFor(UpdateExampleRequestDto, payload(0))).toContain(
      'version must not be less than 1',
    );
  });

  it.each([
    ['negative', -1],
    ['float', 1.5],
    ['string', 'abc'],
    ['missing', undefined],
  ])('rejects %s', (_label, version) => {
    expect(messagesFor(UpdateExampleRequestDto, payload(version))).not.toEqual([]);
  });
});
