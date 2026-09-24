import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateStoreRequestDto } from './store.dto';

describe('UpdateStoreRequestDto — PATCH partial', () => {
  const errorsFor = (payload: object) =>
    validateSync(plainToInstance(UpdateStoreRequestDto, payload), { whitelist: true });

  it('chấp nhận body rỗng (không đổi field nào)', () => {
    expect(errorsFor({})).toEqual([]);
  });

  it.each([
    ['name', { name: 'Tên mới' }],
    ['code', { code: 'ST-HN-02' }],
    ['isActive', { isActive: false }],
  ])('chấp nhận body chỉ có %s', (_label, payload) => {
    expect(errorsFor(payload)).toEqual([]);
  });

  // Optional KHÔNG có nghĩa là bỏ validate: field nào CÓ mặt vẫn phải hợp lệ.
  it.each([
    ['code sai format', { code: '!' }, 'STORE_CODE_INVALID'],
    ['taxCode sai format', { taxCode: 'abc' }, 'STORE_TAX_CODE_INVALID'],
    ['email sai format', { email: 'not-an-email' }, 'STORE_EMAIL_INVALID'],
  ])('vẫn từ chối %s khi field có mặt', (_label, payload, expected) => {
    const messages = errorsFor(payload).flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages).toContain(expected);
  });

  // `PartialType` sao chép initializer `isActive = true` của DTO cha — phải bị huỷ, nếu không PATCH
  // không gửi `isActive` sẽ bật lại cửa hàng đã ngừng hoạt động.
  it('không tự gán isActive = true khi body không gửi field đó', () => {
    const dto = plainToInstance(UpdateStoreRequestDto, {});
    expect(dto.isActive).toBeUndefined();
  });
});
