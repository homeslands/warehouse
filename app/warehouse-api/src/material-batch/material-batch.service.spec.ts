import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Equal, LessThan } from 'typeorm';
import { MaterialBatchService, compareFefo } from './material-batch.service';
import { MaterialBatchProfile } from './material-batch.mapper';
import { MaterialBatch } from './material-batch.entity';
import { MaterialBatchStatus } from './material-batch.constants';
import { MaterialBatchValidation } from './material-batch.validation';
import { MaterialBatchException } from './material-batch.exception';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { WarehouseValidation } from 'src/warehouse/warehouse.validation';
import { ImportForm } from 'src/import-form/import-form.entity';
import { ImportFormItem } from 'src/import-form/import-form-item.entity';

const batch = (overrides: Partial<MaterialBatch> = {}): MaterialBatch =>
  ({
    id: 'b-1',
    slug: 'b-1-slug',
    entryDate: '2026-01-01',
    expiryDate: '2026-12-31',
    quantity: 10,
    remainingQuantity: 10,
    status: MaterialBatchStatus.InStock,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }) as MaterialBatch;

describe('MaterialBatchService', () => {
  let service: MaterialBatchService;
  const batchRepository = { findAndCount: jest.fn(), findOne: jest.fn() };
  const warehouseRepository = { findOneBy: jest.fn() };
  /** Repository lấy qua `manager` bên trong transaction của caller. */
  const txBatchRepository = {
    find: jest.fn(),
    update: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => data),
  };
  const manager = { getRepository: jest.fn(() => txBatchRepository) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialBatchService,
        MaterialBatchProfile,
        { provide: getRepositoryToken(MaterialBatch), useValue: batchRepository },
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
      ],
    }).compile();
    await module.init();
    service = module.get(MaterialBatchService);
  });

  describe('compareFefo', () => {
    it('orders by expiry ascending, no-expiry last, then entry date, then creation', () => {
      const noExpiry = batch({ id: 'none', expiryDate: null });
      const late = batch({ id: 'late', expiryDate: '2027-06-01' });
      const earlyOld = batch({
        id: 'early-old',
        expiryDate: '2026-03-01',
        entryDate: '2025-01-01',
      });
      const earlyNew = batch({
        id: 'early-new',
        expiryDate: '2026-03-01',
        entryDate: '2025-06-01',
      });

      expect([noExpiry, late, earlyNew, earlyOld].sort(compareFefo).map(({ id }) => id)).toEqual([
        'early-old',
        'early-new',
        'late',
        'none',
      ]);
    });
  });

  describe('consume', () => {
    const consume = (lines: Parameters<MaterialBatchService['consume']>[2]) =>
      service.consume(manager as never, 'wh-1', lines);

    it('locks in-stock batches of the material by FK column (no join) with FOR UPDATE', async () => {
      txBatchRepository.find.mockResolvedValue([batch()]);

      await consume([{ key: 'l1', materialId: 'mat-1', baseQuantity: 1 }]);

      expect(txBatchRepository.find).toHaveBeenCalledWith({
        where: {
          warehouse: Equal('wh-1'),
          material: Equal('mat-1'),
          status: MaterialBatchStatus.InStock,
        },
        lock: { mode: 'pessimistic_write' },
      });
    });

    it('takes from the earliest-expiry batches first, across several batches', async () => {
      const late = batch({ id: 'late', expiryDate: '2027-01-01', remainingQuantity: 10 });
      const early = batch({ id: 'early', expiryDate: '2026-02-01', remainingQuantity: 4 });
      txBatchRepository.find.mockResolvedValue([late, early]);

      const result = await consume([{ key: 'l1', materialId: 'mat-1', baseQuantity: 6.5 }]);

      expect(result.get('l1')).toEqual([
        { batch: early, baseQuantity: 4 },
        { batch: late, baseQuantity: 2.5 },
      ]);
      expect(txBatchRepository.update).toHaveBeenCalledWith(
        { id: 'early' },
        { remainingQuantity: 0, status: MaterialBatchStatus.OutOfStock },
      );
      expect(txBatchRepository.update).toHaveBeenCalledWith(
        { id: 'late' },
        { remainingQuantity: 7.5, status: MaterialBatchStatus.InStock },
      );
    });

    it('serves lines with an explicit batch before FEFO lines', async () => {
      const early = batch({ id: 'early', expiryDate: '2026-02-01', remainingQuantity: 5 });
      const late = batch({ id: 'late', expiryDate: '2027-01-01', remainingQuantity: 5 });
      txBatchRepository.find.mockResolvedValue([early, late]);

      // FEFO line comes first in the array but must not eat the explicitly chosen batch.
      const result = await consume([
        { key: 'fefo', materialId: 'mat-1', baseQuantity: 5 },
        { key: 'pick', materialId: 'mat-1', baseQuantity: 5, batchId: 'early' },
      ]);

      expect(result.get('pick')).toEqual([{ batch: early, baseQuantity: 5 }]);
      expect(result.get('fefo')).toEqual([{ batch: late, baseQuantity: 5 }]);
    });

    it('rejects when the chosen batch does not have enough left', async () => {
      txBatchRepository.find.mockResolvedValue([batch({ id: 'b-1', remainingQuantity: 2 })]);

      const promise = consume([
        { key: 'l1', materialId: 'mat-1', baseQuantity: 3, batchId: 'b-1' },
      ]);

      await expect(promise).rejects.toBeInstanceOf(MaterialBatchException);
      await expect(promise).rejects.toMatchObject({
        code: MaterialBatchValidation.MATERIAL_BATCH_INSUFFICIENT.code,
      });
      expect(txBatchRepository.update).not.toHaveBeenCalled();
    });

    it('rejects when the chosen batch is out of stock / not in this warehouse', async () => {
      txBatchRepository.find.mockResolvedValue([batch({ id: 'other' })]);

      await expect(
        consume([{ key: 'l1', materialId: 'mat-1', baseQuantity: 1, batchId: 'gone' }]),
      ).rejects.toMatchObject({ code: MaterialBatchValidation.MATERIAL_BATCH_INSUFFICIENT.code });
    });

    it('rejects when all batches together are not enough', async () => {
      txBatchRepository.find.mockResolvedValue([
        batch({ id: 'a', remainingQuantity: 1 }),
        batch({ id: 'b', remainingQuantity: 1 }),
      ]);

      await expect(
        consume([{ key: 'l1', materialId: 'mat-1', baseQuantity: 2.000001 }]),
      ).rejects.toMatchObject({ code: MaterialBatchValidation.MATERIAL_BATCH_INSUFFICIENT.code });
      expect(txBatchRepository.update).not.toHaveBeenCalled();
    });

    it('processes materials in a fixed id order to avoid deadlocks', async () => {
      txBatchRepository.find.mockImplementation(async ({ where }) => [
        batch({ id: `b-${where.material.value}` }),
      ]);

      await consume([
        { key: 'l1', materialId: 'mat-b', baseQuantity: 1 },
        { key: 'l2', materialId: 'mat-a', baseQuantity: 1 },
      ]);

      expect(txBatchRepository.find.mock.calls.map(([q]) => q.where.material.value)).toEqual([
        'mat-a',
        'mat-b',
      ]);
    });
  });

  describe('createFromImportItems', () => {
    it('creates 1 full batch per line with the form date and the line expiry', async () => {
      const form = { id: 'f-1', date: '2026-10-12', warehouse: { id: 'wh-1' } } as ImportForm;
      const items = [
        { id: 'i1', material: { id: 'mat-1' }, baseQuantity: 100, expiryDate: '2027-01-01' },
        { id: 'i2', material: { id: 'mat-2' }, baseQuantity: 0.5 },
      ] as unknown as ImportFormItem[];

      await service.createFromImportItems(manager as never, form, items);

      expect(txBatchRepository.save).toHaveBeenCalledWith([
        {
          material: { id: 'mat-1' },
          warehouse: { id: 'wh-1' },
          importFormItem: { id: 'i1' },
          entryDate: '2026-10-12',
          expiryDate: '2027-01-01',
          quantity: 100,
          remainingQuantity: 100,
          status: MaterialBatchStatus.InStock,
        },
        expect.objectContaining({ importFormItem: { id: 'i2' }, expiryDate: null, quantity: 0.5 }),
      ]);
    });

    it('does nothing for a form without lines', async () => {
      await service.createFromImportItems(manager as never, {} as ImportForm, []);
      expect(txBatchRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll / findOne', () => {
    it('filters by material, status and expiryBefore, and maps the response', async () => {
      warehouseRepository.findOneBy.mockResolvedValue({ id: 'wh-1', slug: 'wh-slug' });
      batchRepository.findAndCount.mockResolvedValue([
        [
          batch({
            material: { slug: 'mat-slug', code: 'M-1', name: 'Mat' },
            warehouse: { slug: 'wh-slug' },
            importFormItem: { importForm: { slug: 'pn-slug', code: 'PN-1' } },
          } as unknown as Partial<MaterialBatch>),
        ],
        1,
      ]);

      const result = await service.findAll('wh-slug', {
        page: 1,
        size: 10,
        materialSlug: 'mat-slug',
        status: MaterialBatchStatus.InStock,
        expiryBefore: '2027-01-01',
      });

      expect(batchRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            warehouse: { id: 'wh-1' },
            material: { slug: 'mat-slug' },
            status: MaterialBatchStatus.InStock,
            expiryDate: LessThan('2027-01-01'),
          },
        }),
      );
      expect(result.items[0]).toMatchObject({
        slug: 'b-1-slug',
        remainingQuantity: 10,
        status: MaterialBatchStatus.InStock,
        materialSlug: 'mat-slug',
        materialCode: 'M-1',
        warehouseSlug: 'wh-slug',
        importFormSlug: 'pn-slug',
        importFormCode: 'PN-1',
      });
      expect(result.items[0]).not.toHaveProperty('id');
    });

    it('reports WAREHOUSE_NOT_FOUND for an unknown warehouse', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(null);

      await expect(service.findAll('nope', { page: 1, size: 10 })).rejects.toMatchObject({
        code: WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      });
    });

    it('reports MATERIAL_BATCH_NOT_FOUND when the warehouse exists but the batch does not', async () => {
      batchRepository.findOne.mockResolvedValue(null);
      warehouseRepository.findOneBy.mockResolvedValue({ id: 'wh-1' });

      await expect(service.findOne('wh-slug', 'nope')).rejects.toMatchObject({
        code: MaterialBatchValidation.MATERIAL_BATCH_NOT_FOUND.code,
      });
    });
  });
});
