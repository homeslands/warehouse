import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateUnitRequestDto, UpdateUnitRequestDto } from './unit.dto';

describe('UpdateUnitRequestDto — PATCH partial', () => {
  const errorsFor = (payload: object) =>
    validateSync(plainToInstance(UpdateUnitRequestDto, payload), { whitelist: true });

  it('chấp nhận body rỗng (không đổi field nào)', () => {
    expect(errorsFor({})).toEqual([]);
  });

  it('chấp nhận body chỉ có description', () => {
    expect(errorsFor({ description: 'Mô tả mới' })).toEqual([]);
  });

  it('vẫn validate field CÓ mặt — code sai format bị chặn', () => {
    expect(errorsFor({ code: '-KG-' }).map((e) => e.property)).toEqual(['code']);
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
