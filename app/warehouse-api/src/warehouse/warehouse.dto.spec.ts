import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateWarehouseRequestDto } from './warehouse.dto';

describe('UpdateWarehouseRequestDto — PATCH partial', () => {
  const errorsFor = (payload: object) =>
    validateSync(plainToInstance(UpdateWarehouseRequestDto, payload), { whitelist: true });

  it('chấp nhận body rỗng (không đổi field nào)', () => {
    expect(errorsFor({})).toEqual([]);
  });

  it('chấp nhận body chỉ có name', () => {
    expect(errorsFor({ name: 'Kho mới' })).toEqual([]);
  });

  // Optional KHÔNG có nghĩa là bỏ validate: field nào CÓ mặt vẫn phải hợp lệ.
  it('vẫn từ chối isActive sai kiểu khi field có mặt', () => {
    const messages = errorsFor({ isActive: 'khong-phai-boolean' }).flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );
    expect(messages).toContain('WAREHOUSE_IS_ACTIVE_INVALID');
  });

  // `PartialType` sao chép initializer `isActive = true` của DTO cha — phải bị huỷ, nếu không PATCH
  // không gửi `isActive` sẽ bật lại kho đã ngừng hoạt động.
  it('không tự gán isActive = true khi body không gửi field đó', () => {
    expect(plainToInstance(UpdateWarehouseRequestDto, {}).isActive).toBeUndefined();
  });
});
