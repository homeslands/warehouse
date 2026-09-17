import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AssignStoreWarehouseRequestDto, UpdateStoreRequestDto } from './store.dto';

const updatePayload = (version: unknown) => ({
  name: 'Cửa hàng Hà Nội 1',
  code: 'ST-HN-01',
  legalName: 'Công ty TNHH ABC',
  taxCode: '0101234567',
  version,
});

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
describe('version phải >= 1 trên mọi write DTO của store', () => {
  describe('UpdateStoreRequestDto.version', () => {
    it.each([1, 2, 99])('accepts version %i', (version) => {
      expect(messagesFor(UpdateStoreRequestDto, updatePayload(version))).toEqual([]);
    });

    it('rejects 0 — giá trị bypass được optimistic lock của TypeORM', () => {
      expect(messagesFor(UpdateStoreRequestDto, updatePayload(0))).toContain(
        'STORE_VERSION_IS_REQUIRED',
      );
    });

    it.each([-1, -100])('rejects negative version %i', (version) => {
      expect(messagesFor(UpdateStoreRequestDto, updatePayload(version))).toContain(
        'STORE_VERSION_IS_REQUIRED',
      );
    });

    it.each([
      ['float', 1.5],
      ['string', 'abc'],
      ['missing', undefined],
    ])('rejects %s', (_label, version) => {
      expect(messagesFor(UpdateStoreRequestDto, updatePayload(version))).toContain(
        'STORE_VERSION_IS_REQUIRED',
      );
    });
  });

  describe('AssignStoreWarehouseRequestDto.version', () => {
    const payload = (version: unknown) => ({ warehouseSlug: 'wh-slug-1', version });

    it('accepts version 1', () => {
      expect(messagesFor(AssignStoreWarehouseRequestDto, payload(1))).toEqual([]);
    });

    it('rejects 0 — endpoint PUT /stores/:slug/warehouse cũng phải chặn', () => {
      expect(messagesFor(AssignStoreWarehouseRequestDto, payload(0))).toContain(
        'STORE_VERSION_IS_REQUIRED',
      );
    });
  });
});
