import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateMaterialTypeRequestDto } from './material-type.dto';

describe('UpdateMaterialTypeRequestDto — PATCH partial', () => {
  const errorsFor = (payload: object) =>
    validateSync(plainToInstance(UpdateMaterialTypeRequestDto, payload), { whitelist: true });

  it('chấp nhận body rỗng (không đổi field nào)', () => {
    expect(errorsFor({})).toEqual([]);
  });

  it('chấp nhận body chỉ có name', () => {
    expect(errorsFor({ name: 'Vật tư lâu bền' })).toEqual([]);
  });

  // Optional KHÔNG có nghĩa là bỏ validate: field nào CÓ mặt vẫn phải hợp lệ.
  it('vẫn từ chối code sai format khi field có mặt', () => {
    const messages = errorsFor({ code: '!' }).flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages).toContain('MATERIAL_TYPE_CODE_INVALID');
  });
});
