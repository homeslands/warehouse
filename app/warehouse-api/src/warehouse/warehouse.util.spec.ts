import { Repository } from 'typeorm';
import { Warehouse } from './warehouse.entity';
import { WarehouseException } from './warehouse.exception';
import { WarehouseValidation } from './warehouse.validation';
import { findWarehouse } from './warehouse.util';

describe('findWarehouse', () => {
  const findOneBy = jest.fn();
  const repository = { findOneBy } as unknown as Repository<Warehouse>;

  beforeEach(() => findOneBy.mockReset());

  it('looks the warehouse up by slug and returns it', async () => {
    const warehouse = { id: 'w1', slug: 'kho-a' } as Warehouse;
    findOneBy.mockResolvedValue(warehouse);

    await expect(findWarehouse(repository, 'kho-a')).resolves.toBe(warehouse);
    expect(findOneBy).toHaveBeenCalledWith({ slug: 'kho-a' });
  });

  it('throws WAREHOUSE_NOT_FOUND when the slug does not exist', async () => {
    findOneBy.mockResolvedValue(null);

    const call = findWarehouse(repository, 'missing');

    await expect(call).rejects.toBeInstanceOf(WarehouseException);
    await expect(call).rejects.toMatchObject({
      code: WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
    });
  });
});
