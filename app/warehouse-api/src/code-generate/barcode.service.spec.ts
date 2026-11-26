import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { BarcodeService } from './barcode.service';
import { CodeGenerateService } from './code-generate.service';
import { CodeType } from './code-generate.constants';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { WarehouseException } from 'src/warehouse/warehouse.exception';
import { WarehouseValidation } from 'src/warehouse/warehouse.validation';
import { InventoryException } from 'src/inventory/inventory.exception';
import { InventoryValidation } from 'src/inventory/inventory.validation';
import { TransactionManagerService } from 'src/db/transaction-manager.service';

const warehouse = (overrides: Partial<Warehouse> = {}): Warehouse =>
  ({ id: 'wh-id-1', slug: 'wh-slug-1', isActive: true, ...overrides }) as Warehouse;

describe('BarcodeService', () => {
  let service: BarcodeService;
  const warehouseRepository = { findOneBy: jest.fn() };
  const manager = {};
  const transactionManager = { execute: jest.fn((onSave) => onSave(manager)) };
  const codeGenerateService = { generate: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BarcodeService,
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepository },
        { provide: TransactionManagerService, useValue: transactionManager },
        { provide: CodeGenerateService, useValue: codeGenerateService },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get(BarcodeService);
  });

  describe('generateMaterialBarcode', () => {
    it('issues only a barcode (no item code) for the warehouse inside a transaction', async () => {
      const wh = warehouse({ code: 'WH-HN-01' });
      warehouseRepository.findOneBy.mockResolvedValue(wh);
      codeGenerateService.generate.mockResolvedValue('2000100000014');

      const result = await service.generateMaterialBarcode('wh-slug-1');

      expect(result).toEqual({ barcode: '2000100000014' });
      expect(transactionManager.execute).toHaveBeenCalledTimes(1);
      expect(codeGenerateService.generate).toHaveBeenCalledTimes(1);
      expect(codeGenerateService.generate).toHaveBeenCalledWith(manager, CodeType.Barcode, wh);
    });

    it('refuses an inactive warehouse without consuming any number', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse({ isActive: false }));

      const promise = service.generateMaterialBarcode('wh-slug-1');
      await expect(promise).rejects.toBeInstanceOf(InventoryException);
      await expect(promise).rejects.toMatchObject({
        code: InventoryValidation.INVENTORY_WAREHOUSE_INACTIVE.code,
      });
      expect(codeGenerateService.generate).not.toHaveBeenCalled();
    });

    it('throws WAREHOUSE_NOT_FOUND for an unknown warehouse', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(null);

      const promise = service.generateMaterialBarcode('missing');
      await expect(promise).rejects.toBeInstanceOf(WarehouseException);
      await expect(promise).rejects.toMatchObject({
        code: WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      });
    });
  });
});
