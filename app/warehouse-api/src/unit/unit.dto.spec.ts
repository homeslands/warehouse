import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateUnitRequestDto, UpdateUnitRequestDto } from './unit.dto';

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
describe('UpdateUnitRequestDto.version', () => {
  const payload = (version: unknown) => ({ name: 'Kilogram', code: 'KG', version });

  it.each([1, 2, 99])('accepts version %i', (version) => {
    expect(messagesFor(UpdateUnitRequestDto, payload(version))).toEqual([]);
  });

  it('rejects 0 — giá trị bypass được optimistic lock của TypeORM', () => {
    expect(messagesFor(UpdateUnitRequestDto, payload(0))).toContain('UNIT_VERSION_IS_REQUIRED');
  });

  it.each([
    ['negative', -1],
    ['float', 1.5],
    ['string', 'abc'],
    ['missing', undefined],
  ])('rejects %s', (_label, version) => {
    expect(messagesFor(UpdateUnitRequestDto, payload(version))).not.toEqual([]);
  });
});

describe('UpdateUnitRequestDto — PATCH partial', () => {
  const errorsFor = (payload: object) =>
    validateSync(plainToInstance(UpdateUnitRequestDto, payload), { whitelist: true });

  it('chấp nhận body chỉ có version (không đổi field nào)', () => {
    expect(errorsFor({ version: 1 })).toEqual([]);
  });

  it('chấp nhận body chỉ có description', () => {
    expect(errorsFor({ description: 'Mô tả mới', version: 1 })).toEqual([]);
  });

  it('vẫn validate field CÓ mặt — code sai format bị chặn', () => {
    expect(errorsFor({ code: '-KG-', version: 1 }).map((e) => e.property)).toEqual(['code']);
  });
});

describe('CreateUnitRequestDto.code', () => {
  const messagesFor = (code: unknown) =>
    validateSync(plainToInstance(CreateUnitRequestDto, { name: 'Lít', code }), { whitelist: true })
      .filter((e) => e.property === 'code')
      .flatMap((e) => Object.values(e.constraints ?? {}));

  // Ký hiệu đơn vị chuẩn có thể chỉ 1 ký tự — khác mã vật tư/loại vật tư (tối thiểu 2).
  it.each(['L', 'm', 'G', 'KG', 'M3', 'THUNG-24', 'A'.repeat(32)])('chấp nhận %s', (code) => {
    expect(messagesFor(code)).toEqual([]);
  });

  it.each([
    ['gạch ngang đơn', '-'],
    ['bắt đầu bằng gạch ngang', '-L'],
    ['kết thúc bằng gạch ngang', 'L-'],
    ['ký tự đặc biệt', 'L/H'],
    ['dài hơn 32 ký tự', 'A'.repeat(33)],
  ])('từ chối %s', (_label, code) => {
    expect(messagesFor(code)).toContain('UNIT_CODE_INVALID');
  });
});
