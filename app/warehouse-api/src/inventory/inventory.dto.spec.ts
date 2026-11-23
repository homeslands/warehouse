import { plainToInstance } from 'class-transformer';
import { ValidationError, validateSync } from 'class-validator';
import { CreateInventoryMaterialRequestDto } from './inventory.dto';

/** Message của mọi lỗi, kể cả lỗi của DTO lồng (`material`), theo thứ tự duyệt sâu. */
const messagesOf = (payload: object) => {
  const flatten = (errors: ValidationError[]): string[] =>
    errors.flatMap((e) => [...Object.values(e.constraints ?? {}), ...flatten(e.children ?? [])]);
  return flatten(
    validateSync(plainToInstance(CreateInventoryMaterialRequestDto, payload), { whitelist: true }),
  );
};

describe('CreateInventoryMaterialRequestDto', () => {
  const material = { code: 'MAT-001', name: 'Găng tay', typeSlug: 't', baseUnitSlug: 'u' };

  it('accepts a body with every required material field (warehouse part optional)', () => {
    expect(messagesOf({ material })).toEqual([]);
  });

  it('requires the material object', () => {
    expect(messagesOf({ quantity: 1 })).toContain('INVENTORY_MATERIAL_IS_REQUIRED');
  });

  // POST tạo vật tư mới nên phải đủ mọi field bắt buộc của `POST /materials` — trừ `code` (tự sinh).
  it.each([
    ['name', 'MATERIAL_NAME_IS_REQUIRED'],
    ['typeSlug', 'MATERIAL_TYPE_SLUG_IS_REQUIRED'],
    ['baseUnitSlug', 'MATERIAL_BASE_UNIT_SLUG_IS_REQUIRED'],
  ])('requires material.%s', (field, message) => {
    const partial: Record<string, unknown> = { ...material };
    delete partial[field];
    expect(messagesOf({ material: partial })).toContain(message);
  });

  it('does not require material.code (server generates it)', () => {
    const withoutCode: Record<string, unknown> = { ...material };
    delete withoutCode.code;
    expect(messagesOf({ material: withoutCode })).toEqual([]);
  });

  it('still validates material.code when it is sent', () => {
    expect(messagesOf({ material: { ...material, code: '-bad-' } })).toContain(
      'MATERIAL_CODE_INVALID',
    );
  });

  it('keeps the other material fields through whitelist (OmitType copies their metadata)', () => {
    const dto = plainToInstance(CreateInventoryMaterialRequestDto, {
      material: { ...material, barcode: '2000100000014', minimumInventory: 5 },
    });
    validateSync(dto, { whitelist: true });
    expect(dto.material).toMatchObject({ barcode: '2000100000014', minimumInventory: 5 });
  });

  it('accepts an optional supplierSlug (trimmed)', () => {
    const dto = plainToInstance(CreateInventoryMaterialRequestDto, {
      material,
      supplierSlug: '  sup-slug-1 ',
    });
    expect(validateSync(dto, { whitelist: true })).toEqual([]);
    expect(dto.supplierSlug).toBe('sup-slug-1');
  });

  it.each([[''], ['   '], [123]])('rejects supplierSlug = %p', (supplierSlug) => {
    expect(messagesOf({ material, supplierSlug })).toContain('INVENTORY_SUPPLIER_SLUG_INVALID');
  });

  it('does not take materialSlug (that is the PUT assign body)', () => {
    const dto = plainToInstance(CreateInventoryMaterialRequestDto, { material, materialSlug: 'x' });
    validateSync(dto, { whitelist: true });
    expect(dto).not.toHaveProperty('materialSlug');
  });
});
