import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateMaterialTypeRequestDto } from './material-type.dto';

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
describe('UpdateMaterialTypeRequestDto.version', () => {
  const payload = (version: unknown) => ({
    ...{ name: 'Vật tư tiêu hao', code: 'MT-TH' },
    version,
  });

  it.each([1, 2, 99])('accepts version %i', (version) => {
    expect(messagesFor(UpdateMaterialTypeRequestDto, payload(version))).toEqual([]);
  });

  it('rejects 0 — giá trị bypass được optimistic lock của TypeORM', () => {
    expect(messagesFor(UpdateMaterialTypeRequestDto, payload(0))).toContain(
      'MATERIAL_TYPE_VERSION_IS_REQUIRED',
    );
  });

  it.each([
    ['negative', -1],
    ['float', 1.5],
    ['string', 'abc'],
    ['missing', undefined],
  ])('rejects %s', (_label, version) => {
    expect(messagesFor(UpdateMaterialTypeRequestDto, payload(version))).not.toEqual([]);
  });
});

describe('UpdateMaterialTypeRequestDto — PATCH partial', () => {
  const errorsFor = (payload: object) =>
    validateSync(plainToInstance(UpdateMaterialTypeRequestDto, payload), { whitelist: true });

  it('chấp nhận body chỉ có version (không đổi field nào)', () => {
    expect(errorsFor({ version: 1 })).toEqual([]);
  });

  it('chấp nhận body chỉ có name', () => {
    expect(errorsFor({ name: 'Vật tư lâu bền', version: 1 })).toEqual([]);
  });

  // Optional KHÔNG có nghĩa là bỏ validate: field nào CÓ mặt vẫn phải hợp lệ.
  it('vẫn từ chối code sai format khi field có mặt', () => {
    const messages = errorsFor({ code: '!', version: 1 }).flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );
    expect(messages).toContain('MATERIAL_TYPE_CODE_INVALID');
  });
});
