import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  AssignMaterialSuppliersRequestDto,
  CreateMaterialConversionUnitRequestDto,
  CreateMaterialRequestDto,
  GetAllMaterialRequestDto,
  UpdateMaterialConversionUnitRequestDto,
  UpdateMaterialRequestDto,
} from './material.dto';

describe('UpdateMaterialRequestDto — PATCH partial', () => {
  const errorsFor = (payload: object) =>
    validateSync(plainToInstance(UpdateMaterialRequestDto, payload), { whitelist: true });

  it('chấp nhận body rỗng (không đổi field nào)', () => {
    expect(errorsFor({})).toEqual([]);
  });

  it('chấp nhận body chỉ có name', () => {
    expect(errorsFor({ name: 'Găng tay nitrile' })).toEqual([]);
  });

  it('vẫn từ chối minimumInventory âm khi field có mặt', () => {
    const messages = errorsFor({ minimumInventory: -1 }).flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );
    expect(messages).toContain('MATERIAL_MINIMUM_INVENTORY_INVALID');
  });

  // `PartialType` sao chép initializer `= 0` của DTO cha — phải bị huỷ, nếu không PATCH không gửi
  // ngưỡng tồn sẽ reset cả 2 về 0.
  it('không tự gán ngưỡng tồn = 0 khi body không gửi chúng', () => {
    const dto = plainToInstance(UpdateMaterialRequestDto, {});
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
    expect(errorsFor({ minimumInventory: 0.5, maximumInventory: 10.25 })).toEqual([]);
  });

  it('vẫn từ chối ngưỡng âm', () => {
    const messages = errorsFor({ minimumInventory: -0.5 })
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

describe('CreateMaterialRequestDto.baseUnitSlug — bắt buộc', () => {
  const payload = { code: 'MAT-001', name: 'Găng tay', typeSlug: 'type-slug-1' };
  const messagesFor = (body: object) =>
    validateSync(plainToInstance(CreateMaterialRequestDto, body), { whitelist: true })
      .filter((e) => e.property === 'baseUnitSlug')
      .flatMap((e) => Object.values(e.constraints ?? {}));

  it('chấp nhận khi có baseUnitSlug', () => {
    expect(messagesFor({ ...payload, baseUnitSlug: 'unit-slug-1' })).toEqual([]);
  });

  it.each([
    ['thiếu', undefined],
    ['null', null],
    ['chuỗi rỗng', ''],
    ['chỉ có khoảng trắng', '   '],
  ])('từ chối baseUnitSlug %s', (_label, baseUnitSlug) => {
    expect(messagesFor({ ...payload, baseUnitSlug })).toContain(
      'MATERIAL_BASE_UNIT_SLUG_IS_REQUIRED',
    );
  });
});

describe('UpdateMaterialRequestDto.baseUnitSlug — PATCH', () => {
  const messagesFor = (body: object) =>
    validateSync(plainToInstance(UpdateMaterialRequestDto, body), { whitelist: true })
      .filter((e) => e.property === 'baseUnitSlug')
      .flatMap((e) => Object.values(e.constraints ?? {}));

  it('không bắt buộc gửi', () => {
    expect(messagesFor({ version: 1 })).toEqual([]);
  });

  it('gửi thì không được rỗng', () => {
    expect(messagesFor({ baseUnitSlug: '', version: 1 })).toContain(
      'MATERIAL_BASE_UNIT_SLUG_IS_REQUIRED',
    );
  });
});

describe('GetAllMaterialRequestDto.hasSupplier — query string', () => {
  const parse = (hasSupplier: unknown) => {
    const dto = plainToInstance(GetAllMaterialRequestDto, { hasSupplier });
    return { dto, messages: validateSync(dto).flatMap((e) => Object.values(e.constraints ?? {})) };
  };

  it.each([
    ['true', true],
    ['false', false],
  ])("chuyển '%s' sang boolean", (raw, expected) => {
    const { dto, messages } = parse(raw);
    expect(dto.hasSupplier).toBe(expected);
    expect(messages).toEqual([]);
  });

  it('từ chối giá trị không phải true/false', () => {
    expect(parse('yes').messages).toContain('MATERIAL_HAS_SUPPLIER_INVALID');
  });
});

describe('GetAllMaterialRequestDto — date range / sort', () => {
  const messagesFor = (query: object) =>
    validateSync(plainToInstance(GetAllMaterialRequestDto, query)).flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );

  it('chấp nhận ngày YYYY-MM-DD và ISO 8601', () => {
    expect(messagesFor({ startDate: '2026-09-01', endDate: '2026-09-30T10:00:00Z' })).toEqual([]);
  });

  it('từ chối ngày sai định dạng', () => {
    const messages = messagesFor({ startDate: 'hôm qua', endDate: '2026-13-45' });
    expect(messages).toContain('MATERIAL_START_DATE_INVALID');
    expect(messages).toContain('MATERIAL_END_DATE_INVALID');
  });

  it.each([
    ['asc', 'ASC'],
    ['DESC', 'DESC'],
  ])("chấp nhận sort '%s' (không phân biệt hoa thường)", (raw, expected) => {
    const dto = plainToInstance(GetAllMaterialRequestDto, { sort: raw });
    expect(dto.sort).toBe(expected);
    expect(validateSync(dto)).toEqual([]);
  });

  it.each([['createdAt:ASC'], ['UP']])('từ chối sort %s', (sort) => {
    expect(messagesFor({ sort })).toContain('MATERIAL_SORT_INVALID');
  });

  it.each([['Găng tay 2'], ['Ống thép Ø'], ['Nước ngọt'], ['Đường']])(
    "chấp nhận name '%s' (tiếng Việt, số, khoảng trắng)",
    (name) => {
      expect(messagesFor({ name })).toEqual([]);
    },
  );

  // Dạng tổ hợp (NFD): nguyên âm + dấu rời — bàn phím/IME trên một số máy gửi kiểu này.
  it('chấp nhận name tiếng Việt dạng tổ hợp (NFD)', () => {
    expect(messagesFor({ name: 'Găng tay'.normalize('NFD') })).toEqual([]);
  });

  it.each([['găng@tay'], ['#1'], ['a,b'], ['50%'], ['a_b'], ['MAT-01']])(
    "từ chối name '%s' chứa ký tự đặc biệt",
    (name) => {
      expect(messagesFor({ name })).toContain('MATERIAL_NAME_SEARCH_INVALID');
    },
  );

  it.each([
    ['MAT-', 'MAT-'],
    [' mat-0 ', 'MAT-0'],
    ['A_B', 'A_B'],
  ])("chấp nhận code '%s' (tự chuyển chữ hoa trước khi validate)", (raw, expected) => {
    const dto = plainToInstance(GetAllMaterialRequestDto, { code: raw });
    expect(dto.code).toBe(expected);
    expect(validateSync(dto)).toEqual([]);
  });

  it.each([['MAT 01'], ['MAT@1'], ['50%'], ['Ố1']])(
    "từ chối code '%s' chứa ký tự ngoài chữ/số/_/-",
    (code) => {
      expect(messagesFor({ code })).toContain('MATERIAL_CODE_SEARCH_INVALID');
    },
  );

  // `OmitType` phải giữ initializer `page = 1` / `size = 10` của `BaseQueryDto`.
  it('vẫn mặc định page = 1, size = 10', () => {
    expect(plainToInstance(GetAllMaterialRequestDto, {})).toMatchObject({ page: 1, size: 10 });
  });
});

describe('AssignMaterialSuppliersRequestDto — PUT /materials/:slug/suppliers', () => {
  const parse = (body: object) => plainToInstance(AssignMaterialSuppliersRequestDto, body);
  const messagesFor = (body: object) =>
    validateSync(parse(body), { whitelist: true }).flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );

  it('chấp nhận mảng rỗng (gỡ hết nhà cung cấp)', () => {
    expect(messagesFor({ supplierSlugs: [] })).toEqual([]);
  });

  it('trim + khử trùng lặp slug', () => {
    expect(parse({ supplierSlugs: [' a ', 'a', 'b'] }).supplierSlugs).toEqual(['a', 'b']);
  });

  it.each([
    ['thiếu field', {}],
    ['không phải mảng', { supplierSlugs: 'a' }],
    ['phần tử rỗng', { supplierSlugs: ['  '] }],
    ['phần tử không phải chuỗi', { supplierSlugs: [1] }],
    ['quá 50 phần tử', { supplierSlugs: Array.from({ length: 51 }, (_, i) => `s${i}`) }],
  ])('từ chối %s', (_label, body) => {
    expect(messagesFor(body)).toContain('MATERIAL_SUPPLIER_SLUGS_INVALID');
  });
});
