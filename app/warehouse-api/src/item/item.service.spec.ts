import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Equal, In, LessThan } from 'typeorm';
import { ItemService, compareFefo } from './item.service';
import { ItemProfile } from './item.mapper';
import { Item } from './item.entity';
import { ITEM_ON_HAND_STATUSES, ItemStatus, statusOfItem } from './item.constants';
import { ExportFormType } from 'src/export-form/export-form.constants';
import { ItemValidation } from './item.validation';
import { ItemException } from './item.exception';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { WarehouseValidation } from 'src/warehouse/warehouse.validation';
import { ImportForm } from 'src/import-form/import-form.entity';
import { UnitProfile } from 'src/unit/unit.mapper';
import { MaterialTypeProfile } from 'src/material-type/material-type.mapper';

const makeItem = (overrides: Partial<Item> = {}): Item =>
  ({
    id: 'b-1',
    slug: 'b-1-slug',
    entryDate: '2026-01-01',
    expiryDate: '2026-12-31',
    quantity: 10,
    remainingQuantity: 10,
    reservedQuantity: 0,
    status: ItemStatus.InStock,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }) as Item;

describe('ItemService', () => {
  let service: ItemService;
  const itemRepository = { findAndCount: jest.fn(), findOne: jest.fn() };
  const warehouseRepository = { findOneBy: jest.fn() };
  /** Repository lấy qua `manager` bên trong transaction của caller. */
  const txItemRepository = {
    find: jest.fn(),
    update: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => data),
  };
  const manager = {
    getRepository: jest.fn(() => txItemRepository),
    update: jest.fn(async () => ({ affected: 2 })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemService,
        ItemProfile,
        UnitProfile,
        MaterialTypeProfile,
        { provide: getRepositoryToken(Item), useValue: itemRepository },
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
      ],
    }).compile();
    await module.init();
    service = module.get(ItemService);
  });

  describe('compareFefo', () => {
    it('orders by expiry ascending, no-expiry last, then entry date, then creation', () => {
      const noExpiry = makeItem({ id: 'none', expiryDate: null });
      const late = makeItem({ id: 'late', expiryDate: '2027-06-01' });
      const earlyOld = makeItem({
        id: 'early-old',
        expiryDate: '2026-03-01',
        entryDate: '2025-01-01',
      });
      const earlyNew = makeItem({
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

  describe('reserve', () => {
    const reserve = (lines: Parameters<ItemService['reserve']>[2]) =>
      service.reserve(manager as never, 'wh-1', lines);

    it('locks on-hand (in-stock + reserved) batches by FK column (no join) with FOR UPDATE', async () => {
      txItemRepository.find.mockResolvedValue([makeItem()]);

      await reserve([{ key: 'l1', materialId: 'mat-1', baseQuantity: 1 }]);

      expect(txItemRepository.find).toHaveBeenCalledWith({
        where: {
          warehouse: Equal('wh-1'),
          material: Equal('mat-1'),
          status: In(ITEM_ON_HAND_STATUSES),
        },
        lock: { mode: 'pessimistic_write' },
      });
    });

    it('holds from the earliest-expiry batches first without touching remainingQuantity', async () => {
      const late = makeItem({ id: 'late', expiryDate: '2027-01-01', remainingQuantity: 10 });
      const early = makeItem({ id: 'early', expiryDate: '2026-02-01', remainingQuantity: 4 });
      txItemRepository.find.mockResolvedValue([late, early]);

      const result = await reserve([{ key: 'l1', materialId: 'mat-1', baseQuantity: 6.5 }]);

      expect(result.get('l1')).toEqual([
        { item: early, baseQuantity: 4 },
        { item: late, baseQuantity: 2.5 },
      ]);
      expect(txItemRepository.update).toHaveBeenCalledWith(
        { id: 'early' },
        { remainingQuantity: 4, reservedQuantity: 4, status: ItemStatus.Reserved },
      );
      expect(txItemRepository.update).toHaveBeenCalledWith(
        { id: 'late' },
        { remainingQuantity: 10, reservedQuantity: 2.5, status: ItemStatus.InStock },
      );
    });

    it('only uses the free part (remaining - reserved) held by other PENDING forms', async () => {
      const early = makeItem({
        id: 'early',
        expiryDate: '2026-02-01',
        remainingQuantity: 10,
        reservedQuantity: 8,
      });
      const late = makeItem({ id: 'late', expiryDate: '2027-01-01', remainingQuantity: 10 });
      txItemRepository.find.mockResolvedValue([early, late]);

      const result = await reserve([{ key: 'l1', materialId: 'mat-1', baseQuantity: 5 }]);

      expect(result.get('l1')).toEqual([
        { item: early, baseQuantity: 2 },
        { item: late, baseQuantity: 3 },
      ]);
    });

    it('rejects a second form asking for what another form already holds', async () => {
      txItemRepository.find.mockResolvedValue([
        makeItem({ id: 'b-1', remainingQuantity: 10, reservedQuantity: 10 }),
      ]);

      await expect(
        reserve([{ key: 'l1', materialId: 'mat-1', baseQuantity: 1 }]),
      ).rejects.toMatchObject({ code: ItemValidation.ITEM_INSUFFICIENT.code });
      expect(txItemRepository.update).not.toHaveBeenCalled();
    });

    it('serves lines with an explicit batch before FEFO lines', async () => {
      const early = makeItem({ id: 'early', expiryDate: '2026-02-01', remainingQuantity: 5 });
      const late = makeItem({ id: 'late', expiryDate: '2027-01-01', remainingQuantity: 5 });
      txItemRepository.find.mockResolvedValue([early, late]);

      // FEFO line comes first in the array but must not eat the explicitly chosen batch.
      const result = await reserve([
        { key: 'fefo', materialId: 'mat-1', baseQuantity: 5 },
        { key: 'pick', materialId: 'mat-1', baseQuantity: 5, itemId: 'early' },
      ]);

      expect(result.get('pick')).toEqual([{ item: early, baseQuantity: 5 }]);
      expect(result.get('fefo')).toEqual([{ item: late, baseQuantity: 5 }]);
    });

    it('rejects when the chosen batch does not have enough free', async () => {
      txItemRepository.find.mockResolvedValue([
        makeItem({ id: 'b-1', remainingQuantity: 5, reservedQuantity: 3 }),
      ]);

      const promise = reserve([{ key: 'l1', materialId: 'mat-1', baseQuantity: 3, itemId: 'b-1' }]);

      await expect(promise).rejects.toBeInstanceOf(ItemException);
      await expect(promise).rejects.toMatchObject({
        code: ItemValidation.ITEM_INSUFFICIENT.code,
      });
      expect(txItemRepository.update).not.toHaveBeenCalled();
    });

    it('rejects when the chosen batch is out of stock / not in this warehouse', async () => {
      txItemRepository.find.mockResolvedValue([makeItem({ id: 'other' })]);

      await expect(
        reserve([{ key: 'l1', materialId: 'mat-1', baseQuantity: 1, itemId: 'gone' }]),
      ).rejects.toMatchObject({ code: ItemValidation.ITEM_INSUFFICIENT.code });
    });

    it('rejects when all batches together are not enough', async () => {
      txItemRepository.find.mockResolvedValue([
        makeItem({ id: 'a', remainingQuantity: 1 }),
        makeItem({ id: 'b', remainingQuantity: 1 }),
      ]);

      await expect(
        reserve([{ key: 'l1', materialId: 'mat-1', baseQuantity: 2.000001 }]),
      ).rejects.toMatchObject({ code: ItemValidation.ITEM_INSUFFICIENT.code });
      expect(txItemRepository.update).not.toHaveBeenCalled();
    });

    it('processes materials in a fixed id order to avoid deadlocks', async () => {
      txItemRepository.find.mockImplementation(async ({ where }) => [
        makeItem({ id: `b-${where.material.value}` }),
      ]);

      await reserve([
        { key: 'l1', materialId: 'mat-b', baseQuantity: 1 },
        { key: 'l2', materialId: 'mat-a', baseQuantity: 1 },
      ]);

      expect(txItemRepository.find.mock.calls.map(([q]) => q.where.material.value)).toEqual([
        'mat-a',
        'mat-b',
      ]);
    });
  });

  describe('consumeReserved / release', () => {
    it('confirm takes the held quantity out of remaining and reserved', async () => {
      txItemRepository.find.mockResolvedValue([
        makeItem({ id: 'b-1', remainingQuantity: 4, reservedQuantity: 4 }),
        makeItem({ id: 'b-2', remainingQuantity: 10, reservedQuantity: 3 }),
      ]);

      await service.consumeReserved(
        manager as never,
        'wh-1',
        [
          { key: 'l1', materialId: 'mat-1', baseQuantity: 4, itemId: 'b-1' },
          { key: 'l2', materialId: 'mat-1', baseQuantity: 2, itemId: 'b-2' },
        ],
        ExportFormType.Sale,
      );

      expect(txItemRepository.update).toHaveBeenCalledWith(
        { id: 'b-1' },
        { remainingQuantity: 0, reservedQuantity: 0, status: ItemStatus.Issued },
      );
      expect(txItemRepository.update).toHaveBeenCalledWith(
        { id: 'b-2' },
        { remainingQuantity: 8, reservedQuantity: 1, status: ItemStatus.InStock },
      );
    });

    it.each([
      [ExportFormType.Disposal, ItemStatus.Disposed],
      [ExportFormType.Transfer, ItemStatus.InTransit],
      [ExportFormType.Production, ItemStatus.Issued],
    ])('a batch emptied by a %s form ends as %s', async (type, status) => {
      txItemRepository.find.mockResolvedValue([
        makeItem({
          id: 'b-1',
          remainingQuantity: 4,
          reservedQuantity: 4,
          status: ItemStatus.Reserved,
        }),
      ]);

      await service.consumeReserved(
        manager as never,
        'wh-1',
        [{ key: 'l1', materialId: 'mat-1', baseQuantity: 4, itemId: 'b-1' }],
        type,
      );

      expect(txItemRepository.update).toHaveBeenCalledWith(
        { id: 'b-1' },
        { remainingQuantity: 0, reservedQuantity: 0, status },
      );
    });

    it('release gives the held quantity back without touching remaining (RESERVED -> IN_STOCK)', async () => {
      txItemRepository.find.mockResolvedValue([
        makeItem({
          id: 'b-1',
          remainingQuantity: 6,
          reservedQuantity: 6,
          status: ItemStatus.Reserved,
        }),
      ]);

      await service.release(manager as never, 'wh-1', [
        { key: 'l1', materialId: 'mat-1', baseQuantity: 6, itemId: 'b-1' },
      ]);

      expect(txItemRepository.update).toHaveBeenCalledWith(
        { id: 'b-1' },
        { remainingQuantity: 6, reservedQuantity: 0, status: ItemStatus.InStock },
      );
    });

    it('rejects a line whose batch is missing or holds less than the line', async () => {
      txItemRepository.find.mockResolvedValue([
        makeItem({ id: 'b-1', remainingQuantity: 10, reservedQuantity: 1 }),
      ]);
      const code = ItemValidation.ITEM_RESERVED_INVALID.code;

      await expect(
        service.consumeReserved(
          manager as never,
          'wh-1',
          [{ key: 'l1', materialId: 'mat-1', baseQuantity: 1, itemId: 'gone' }],
          ExportFormType.Sale,
        ),
      ).rejects.toMatchObject({ code });
      await expect(
        service.release(manager as never, 'wh-1', [
          { key: 'l1', materialId: 'mat-1', baseQuantity: 2, itemId: 'b-1' },
        ]),
      ).rejects.toMatchObject({ code });
      expect(txItemRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('receiveImportForm / voidImportForm', () => {
    it('moves the PENDING items of the form to IN_STOCK, dated with the form date', async () => {
      const form = { id: 'f-1', date: '2026-10-12' } as ImportForm;

      await expect(service.receiveImportForm(manager as never, form)).resolves.toBe(2);

      expect(manager.update).toHaveBeenCalledWith(
        Item,
        { importForm: Equal('f-1'), status: ItemStatus.Pending },
        { status: ItemStatus.InStock, entryDate: '2026-10-12' },
      );
    });

    it('voids the PENDING items of a cancelled form', async () => {
      await service.voidImportForm(manager as never, 'f-1');

      expect(manager.update).toHaveBeenCalledWith(
        Item,
        { importForm: Equal('f-1'), status: ItemStatus.Pending },
        { status: ItemStatus.Void },
      );
    });

    // `PENDING` không nằm trong tập FEFO ⇒ phiếu xuất không giữ chỗ được item chưa nhập kho.
    it('never locks PENDING items for an export form', async () => {
      txItemRepository.find.mockResolvedValue([]);

      await expect(
        service.reserve(manager as never, 'wh-1', [
          { key: 'k', materialId: 'mat-1', baseQuantity: 1 },
        ]),
      ).rejects.toMatchObject({ code: ItemValidation.ITEM_INSUFFICIENT.code });
      expect(txItemRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: In(ITEM_ON_HAND_STATUSES) }),
        }),
      );
      expect(ITEM_ON_HAND_STATUSES).not.toContain(ItemStatus.Pending);
    });
  });

  describe('findAll / findOne', () => {
    it('filters by material, code, status and expiryBefore, and maps the response', async () => {
      warehouseRepository.findOneBy.mockResolvedValue({ id: 'wh-1', slug: 'wh-slug' });
      itemRepository.findAndCount.mockResolvedValue([
        [
          makeItem({
            code: 'IT-WH-001-261012-000001',
            materialCode: 'M-1',
            materialName: 'Mat',
            material: {
              slug: 'mat-slug',
              code: 'M-1',
              name: 'Mat',
              type: { slug: 'type-slug', code: 'XD', name: 'Xay dung' },
              baseUnit: { slug: 'kg', code: 'KG', name: 'Kilogram' },
            },
            warehouse: { slug: 'wh-slug' },
            importForm: { slug: 'pn-slug', code: 'PN-1' },
          } as unknown as Partial<Item>),
        ],
        1,
      ]);

      const result = await service.findAll('wh-slug', {
        page: 1,
        size: 10,
        materialSlug: 'mat-slug',
        code: 'IT-WH-001-261012-000001',
        status: ItemStatus.InStock,
        expiryBefore: '2027-01-01',
      });

      expect(itemRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            warehouse: { id: 'wh-1' },
            material: { slug: 'mat-slug' },
            code: 'IT-WH-001-261012-000001',
            status: ItemStatus.InStock,
            expiryDate: LessThan('2027-01-01'),
          },
        }),
      );
      expect(result.items[0]).toMatchObject({
        slug: 'b-1-slug',
        code: 'IT-WH-001-261012-000001',
        remainingQuantity: 10,
        status: ItemStatus.InStock,
        materialSlug: 'mat-slug',
        materialCode: 'M-1',
        warehouseSlug: 'wh-slug',
        importFormSlug: 'pn-slug',
        importFormCode: 'PN-1',
        material: {
          slug: 'mat-slug',
          code: 'M-1',
          name: 'Mat',
          type: { slug: 'type-slug', code: 'XD', name: 'Xay dung' },
          baseUnit: { slug: 'kg', code: 'KG', name: 'Kilogram' },
        },
      });
      expect(result.items[0]).not.toHaveProperty('id');
    });

    it('reports WAREHOUSE_NOT_FOUND for an unknown warehouse', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(null);

      await expect(service.findAll('nope', { page: 1, size: 10 })).rejects.toMatchObject({
        code: WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      });
    });

    it('reports ITEM_NOT_FOUND when the warehouse exists but the item does not', async () => {
      itemRepository.findOne.mockResolvedValue(null);
      warehouseRepository.findOneBy.mockResolvedValue({ id: 'wh-1' });

      await expect(service.findOne('wh-slug', 'nope')).rejects.toMatchObject({
        code: ItemValidation.ITEM_NOT_FOUND.code,
      });
    });
  });
});

describe('statusOfItem', () => {
  it('is IN_STOCK while part of the remaining is still free', () => {
    expect(statusOfItem(10, 0)).toBe(ItemStatus.InStock);
    expect(statusOfItem(10, 9.5)).toBe(ItemStatus.InStock);
  });

  it('is RESERVED once the whole remaining is held', () => {
    expect(statusOfItem(10, 10)).toBe(ItemStatus.Reserved);
  });

  it('an emptied item follows the export reason, ISSUED by default', () => {
    expect(statusOfItem(0, 0)).toBe(ItemStatus.Issued);
    expect(statusOfItem(0, 0, ExportFormType.Sale)).toBe(ItemStatus.Issued);
    expect(statusOfItem(0, 0, ExportFormType.Disposal)).toBe(ItemStatus.Disposed);
    expect(statusOfItem(0, 0, ExportFormType.Transfer)).toBe(ItemStatus.InTransit);
  });
});
