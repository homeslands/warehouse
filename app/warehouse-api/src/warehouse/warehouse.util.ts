import { Repository } from 'typeorm';
import { Warehouse } from './warehouse.entity';
import { WarehouseException } from './warehouse.exception';
import { WarehouseValidation } from './warehouse.validation';

/**
 * Tra kho theo slug, không thấy ⇒ `WAREHOUSE_NOT_FOUND`. Nhận repository của caller (đã inject
 * `Repository<Warehouse>`) thay vì `WarehouseService` để module nghiệp vụ khác không phải import
 * `WarehouseModule`.
 */
export async function findWarehouse(
  repository: Repository<Warehouse>,
  slug: string,
): Promise<Warehouse> {
  const warehouse = await repository.findOneBy({ slug });
  if (!warehouse) throw new WarehouseException(WarehouseValidation.WAREHOUSE_NOT_FOUND);
  return warehouse;
}
