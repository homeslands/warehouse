import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateUnitRequestDto } from './unit.dto';

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
