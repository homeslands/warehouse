import { Test, TestingModule } from '@nestjs/testing';
import { ItemController } from './item.controller';
import { ItemService } from './item.service';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { WAREHOUSE_SCOPE_KEY } from 'src/warehouse/decorator/warehouse-scope.decorator';

describe('ItemController', () => {
  let controller: ItemController;
  const itemService = { findAll: jest.fn(), findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ItemController],
      providers: [{ provide: ItemService, useValue: itemService }],
    }).compile();
    controller = module.get(ItemController);
  });

  it('passes warehouseSlug then slug through to the service', async () => {
    itemService.findOne.mockResolvedValue({ slug: 'b-slug' });

    const response = await controller.findOne('wh-slug', 'b-slug');

    expect(itemService.findOne).toHaveBeenCalledWith('wh-slug', 'b-slug');
    expect(response.statusCode).toBe(200);
  });

  it('scopes every route to the warehouse in :warehouseSlug', () => {
    expect(Reflect.getMetadata(WAREHOUSE_SCOPE_KEY, ItemController)).toBe('warehouseSlug');
  });

  // Chỉ đọc: không có route ghi nào.
  it('exposes only the 2 read routes', () => {
    const handlers = Object.getOwnPropertyNames(ItemController.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(handlers.sort()).toEqual(['findAll', 'findOne']);
  });

  it.each(['findAll', 'findOne'] as const)('%s requires MATERIAL_READ + WAREHOUSE_READ', (h) => {
    expect(Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, ItemController.prototype[h])).toEqual([
      AuthorityCode.MaterialRead,
      AuthorityCode.WarehouseRead,
    ]);
  });
});
