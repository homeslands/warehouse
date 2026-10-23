import { Test, TestingModule } from '@nestjs/testing';
import { MaterialBatchController } from './material-batch.controller';
import { MaterialBatchService } from './material-batch.service';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { WAREHOUSE_SCOPE_KEY } from 'src/warehouse/decorator/warehouse-scope.decorator';

describe('MaterialBatchController', () => {
  let controller: MaterialBatchController;
  const materialBatchService = { findAll: jest.fn(), findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaterialBatchController],
      providers: [{ provide: MaterialBatchService, useValue: materialBatchService }],
    }).compile();
    controller = module.get(MaterialBatchController);
  });

  it('passes warehouseSlug then slug through to the service', async () => {
    materialBatchService.findOne.mockResolvedValue({ slug: 'b-slug' });

    const response = await controller.findOne('wh-slug', 'b-slug');

    expect(materialBatchService.findOne).toHaveBeenCalledWith('wh-slug', 'b-slug');
    expect(response.statusCode).toBe(200);
  });

  it('scopes every route to the warehouse in :warehouseSlug', () => {
    expect(Reflect.getMetadata(WAREHOUSE_SCOPE_KEY, MaterialBatchController)).toBe('warehouseSlug');
  });

  // Chỉ đọc: không có route ghi nào.
  it('exposes only the 2 read routes', () => {
    const handlers = Object.getOwnPropertyNames(MaterialBatchController.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(handlers.sort()).toEqual(['findAll', 'findOne']);
  });

  it.each(['findAll', 'findOne'] as const)('%s requires MATERIAL_READ + WAREHOUSE_READ', (h) => {
    expect(
      Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, MaterialBatchController.prototype[h]),
    ).toEqual([AuthorityCode.MaterialRead, AuthorityCode.WarehouseRead]);
  });
});
