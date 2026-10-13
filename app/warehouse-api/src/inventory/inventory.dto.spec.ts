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

  // POST tạo vật tư mới nên phải đủ mọi field bắt buộc của `POST /materials`.
  it.each([
    ['code', 'MATERIAL_CODE_IS_REQUIRED'],
    ['name', 'MATERIAL_NAME_IS_REQUIRED'],
    ['typeSlug', 'MATERIAL_TYPE_SLUG_IS_REQUIRED'],
    ['baseUnitSlug', 'MATERIAL_BASE_UNIT_SLUG_IS_REQUIRED'],
  ])('requires material.%s', (field, message) => {
    const partial: Record<string, unknown> = { ...material };
    delete partial[field];
    expect(messagesOf({ material: partial })).toContain(message);
  });

  it('does not take materialSlug (that is the PUT assign body)', () => {
    const dto = plainToInstance(CreateInventoryMaterialRequestDto, { material, materialSlug: 'x' });
    validateSync(dto, { whitelist: true });
    expect(dto).not.toHaveProperty('materialSlug');
  });
});
