import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AssignWarehouseManagerRequestDto, UpdateWarehouseRequestDto } from './warehouse.dto';

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
describe('UpdateWarehouseRequestDto.version', () => {
  const payload = (version: unknown) => ({
    ...{ name: 'Kho Hà Nội', code: 'WH-HN-01', address: 'Số 1, Cầu Giấy' },
    version,
  });

  it.each([1, 2, 99])('accepts version %i', (version) => {
    expect(messagesFor(UpdateWarehouseRequestDto, payload(version))).toEqual([]);
  });

  it('rejects 0 — giá trị bypass được optimistic lock của TypeORM', () => {
    expect(messagesFor(UpdateWarehouseRequestDto, payload(0))).toContain(
      'WAREHOUSE_VERSION_IS_REQUIRED',
    );
  });

  it.each([
    ['negative', -1],
    ['float', 1.5],
    ['string', 'abc'],
    ['missing', undefined],
  ])('rejects %s', (_label, version) => {
    expect(messagesFor(UpdateWarehouseRequestDto, payload(version))).not.toEqual([]);
  });
});

describe('AssignWarehouseManagerRequestDto.version', () => {
  const payload = (version: unknown) => ({ ...{ managerSlug: 'user-slug-1' }, version });

  it.each([1, 2, 99])('accepts version %i', (version) => {
    expect(messagesFor(AssignWarehouseManagerRequestDto, payload(version))).toEqual([]);
  });

  it('rejects 0 — giá trị bypass được optimistic lock của TypeORM', () => {
    expect(messagesFor(AssignWarehouseManagerRequestDto, payload(0))).toContain(
      'WAREHOUSE_VERSION_IS_REQUIRED',
    );
  });

  it.each([
    ['negative', -1],
    ['float', 1.5],
    ['string', 'abc'],
    ['missing', undefined],
  ])('rejects %s', (_label, version) => {
    expect(messagesFor(AssignWarehouseManagerRequestDto, payload(version))).not.toEqual([]);
  });
});

describe('UpdateWarehouseRequestDto — PATCH partial', () => {
  const errorsFor = (payload: object) =>
    validateSync(plainToInstance(UpdateWarehouseRequestDto, payload), { whitelist: true });

  it('chấp nhận body chỉ có version (không đổi field nào)', () => {
    expect(errorsFor({ version: 1 })).toEqual([]);
  });

  it('chấp nhận body chỉ có name', () => {
    expect(errorsFor({ name: 'Kho mới', version: 1 })).toEqual([]);
  });

  // Optional KHÔNG có nghĩa là bỏ validate: field nào CÓ mặt vẫn phải hợp lệ.
  it('vẫn từ chối isActive sai kiểu khi field có mặt', () => {
    const messages = errorsFor({ isActive: 'khong-phai-boolean', version: 1 }).flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );
    expect(messages).toContain('WAREHOUSE_IS_ACTIVE_INVALID');
  });

  // `PartialType` sao chép initializer `isActive = true` của DTO cha — phải bị huỷ, nếu không PATCH
  // không gửi `isActive` sẽ bật lại kho đã ngừng hoạt động.
  it('không tự gán isActive = true khi body không gửi field đó', () => {
    expect(plainToInstance(UpdateWarehouseRequestDto, { version: 1 }).isActive).toBeUndefined();
  });
});
