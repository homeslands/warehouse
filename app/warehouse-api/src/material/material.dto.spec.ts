import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateMaterialConversionUnitRequestDto,
  UpdateMaterialConversionUnitRequestDto,
  UpdateMaterialRequestDto,
} from './material.dto';

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
describe('UpdateMaterialRequestDto.version', () => {
  const payload = (version: unknown) => ({
    ...{ name: 'Xi măng', code: 'MT-001', unit: 'bao', materialTypeSlug: 'mtype-1' },
    version,
  });

  it.each([1, 2, 99])('accepts version %i', (version) => {
    expect(messagesFor(UpdateMaterialRequestDto, payload(version))).toEqual([]);
  });

  it('rejects 0 — giá trị bypass được optimistic lock của TypeORM', () => {
    expect(messagesFor(UpdateMaterialRequestDto, payload(0))).toContain(
      'MATERIAL_VERSION_IS_REQUIRED',
    );
  });

  it.each([
    ['negative', -1],
    ['float', 1.5],
    ['string', 'abc'],
    ['missing', undefined],
  ])('rejects %s', (_label, version) => {
    expect(messagesFor(UpdateMaterialRequestDto, payload(version))).not.toEqual([]);
  });
});

describe('UpdateMaterialRequestDto — PATCH partial', () => {
  const errorsFor = (payload: object) =>
    validateSync(plainToInstance(UpdateMaterialRequestDto, payload), { whitelist: true });

  it('chấp nhận body chỉ có version (không đổi field nào)', () => {
    expect(errorsFor({ version: 1 })).toEqual([]);
  });

  it('chấp nhận body chỉ có name', () => {
    expect(errorsFor({ name: 'Găng tay nitrile', version: 1 })).toEqual([]);
  });

  it('vẫn từ chối minimumInventory âm khi field có mặt', () => {
    const messages = errorsFor({ minimumInventory: -1, version: 1 }).flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );
    expect(messages).toContain('MATERIAL_MINIMUM_INVENTORY_INVALID');
  });

  // `PartialType` sao chép initializer `= 0` của DTO cha — phải bị huỷ, nếu không PATCH không gửi
  // ngưỡng tồn sẽ reset cả 2 về 0.
  it('không tự gán ngưỡng tồn = 0 khi body không gửi chúng', () => {
    const dto = plainToInstance(UpdateMaterialRequestDto, { version: 1 });
    expect(dto.minimumInventory).toBeUndefined();
    expect(dto.maximumInventory).toBeUndefined();
  });
});

// Ngưỡng tồn đổi từ `int` sang DECIMAL(18,6) cùng với tồn kho (migration `1783728000021`) — tồn
// sinh ra từ phép quy đổi nên có phần lẻ, ngưỡng phải so sánh được với nó.
describe('UpdateMaterialRequestDto — ngưỡng tồn DECIMAL', () => {
  const errorsFor = (payload: object) =>
    validateSync(plainToInstance(UpdateMaterialRequestDto, payload), { whitelist: true });

  it('chấp nhận ngưỡng tồn lẻ', () => {
    expect(errorsFor({ minimumInventory: 0.5, maximumInventory: 10.25, version: 1 })).toEqual([]);
  });

  it('vẫn từ chối ngưỡng âm', () => {
    const messages = errorsFor({ minimumInventory: -0.5, version: 1 })
      .filter((e) => e.property === 'minimumInventory')
      .flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages).toContain('MATERIAL_MINIMUM_INVENTORY_INVALID');
  });
});

describe('CreateMaterialConversionUnitRequestDto', () => {
  const errorsFor = (payload: object) =>
    validateSync(plainToInstance(CreateMaterialConversionUnitRequestDto, payload), {
      whitelist: true,
    });

  it('chấp nhận tỉ lệ quy đổi lẻ tới 6 chữ số thập phân (đúng DECIMAL(18,6) của cột)', () => {
    expect(errorsFor({ unitSlug: 'unit-1', conversionRate: 0.000001 })).toEqual([]);
  });

  it.each([
    ['0', 0],
    ['âm', -1],
    ['quá 6 chữ số thập phân', 0.0000001],
  ])('từ chối conversionRate %s', (_label, conversionRate) => {
    const messages = errorsFor({ unitSlug: 'unit-1', conversionRate })
      .filter((e) => e.property === 'conversionRate')
      .flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages).toContain('MATERIAL_CONVERSION_RATE_INVALID');
  });

  it('từ chối thiếu unitSlug', () => {
    const messages = errorsFor({ conversionRate: 50 })
      .filter((e) => e.property === 'unitSlug')
      .flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages).toContain('MATERIAL_UNIT_SLUG_IS_REQUIRED');
  });
});

describe('UpdateMaterialConversionUnitRequestDto — PATCH partial', () => {
  it('chấp nhận body chỉ có conversionRate', () => {
    const dto = plainToInstance(UpdateMaterialConversionUnitRequestDto, { conversionRate: 25 });
    expect(validateSync(dto, { whitelist: true })).toEqual([]);
  });

  // `unitSlug` nằm ở path param — cho đổi qua body là 1 request vừa trỏ dòng này vừa ghi dòng khác.
  // Kiểm qua đúng `ValidationPipe` mà controller dùng: `whitelist` mới là thứ cắt field lạ,
  // `plainToInstance` trần vẫn bê nguyên field không khai báo sang instance.
  it('loại bỏ unitSlug gửi kèm trong body', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });

    const dto = await pipe.transform(
      { conversionRate: 25, unitSlug: 'unit-khac' },
      { type: 'body', metatype: UpdateMaterialConversionUnitRequestDto },
    );

    expect(dto).not.toHaveProperty('unitSlug');
  });
});
