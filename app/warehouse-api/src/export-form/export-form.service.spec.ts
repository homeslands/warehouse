import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { OptimisticLockVersionMismatchError } from 'typeorm';
import { ExportFormService } from './export-form.service';
import { ExportFormProfile } from './export-form.mapper';
import { ExportForm } from './export-form.entity';
import { ExportFormItem } from './export-form-item.entity';
import { ExportFormStatus, ExportFormType } from './export-form.constants';
import { WarehouseValidation } from 'src/warehouse/warehouse.validation';
import { ExportFormValidation } from './export-form.validation';
import { CreateExportFormRequestDto } from './export-form.dto';
import { AuthorityCode } from 'src/authority/authority.constants';
import { CurrentUserDto } from 'src/user/user.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { User } from 'src/user/user.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { Material } from 'src/material/material.entity';
import { Inventory } from 'src/inventory/inventory.entity';
import { InventoryService } from 'src/inventory/inventory.service';
import { InventoryException } from 'src/inventory/inventory.exception';
import { InventoryValidation } from 'src/inventory/inventory.validation';
import { MaterialBatch } from 'src/material-batch/material-batch.entity';
import { MaterialBatchStatus } from 'src/material-batch/material-batch.constants';
import { MaterialBatchService } from 'src/material-batch/material-batch.service';
import { MaterialBatchException } from 'src/material-batch/material-batch.exception';
import { MaterialBatchValidation } from 'src/material-batch/material-batch.validation';
import { CodeGenerateService } from 'src/code-generate/code-generate.service';
import { CodeType } from 'src/code-generate/code-generate.constants';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { S3Service } from 'src/file/s3/s3.service';

describe('ExportFormService', () => {
  let service: ExportFormService;
  const exportFormRepository = {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softRemove: jest.fn(),
  };
  const warehouseRepository = { findOneBy: jest.fn() };
  const userRepository = { findOneBy: jest.fn() };
  const materialRepository = { find: jest.fn() };
  const inventoryRepository = { find: jest.fn() };
  const batchRepository = { find: jest.fn() };
  const allAssigned = async ({ where }: { where: { material: { id: { value: string[] } } } }) =>
    where.material.id.value.map((id) => ({ material: { id } }));
  const manager = { save: jest.fn(), delete: jest.fn(), findOne: jest.fn(), softRemove: jest.fn() };
  const inventoryService = { issue: jest.fn(), reserve: jest.fn(), release: jest.fn() };
  const materialBatchService = {
    reserve: jest.fn(),
    consumeReserved: jest.fn(),
    release: jest.fn(),
  };
  const transactionManager = { execute: jest.fn() };
  const codeGenerateService = { generate: jest.fn() };
  const generatedCode = 'EX-WH-01-261012-000001';
  const s3Service = { uploadFile: jest.fn(), getFileUrl: jest.fn() };

  // Vật tư base = KG, gắn thêm BAO (1 BAO = 50 KG).
  const kg = { id: 'unit-kg', slug: 'kg', code: 'KG', name: 'Kilogram' };
  const bag = { id: 'unit-bag', slug: 'bag', code: 'BAO', name: 'Bao' };
  const cement = {
    id: 'mat-1',
    slug: 'cement',
    code: 'XM-01',
    name: 'Xi mang',
    unitsCanHave: [
      { unit: kg, conversionRate: 1 },
      { unit: bag, conversionRate: 50 },
    ],
  } as unknown as Material;

  const warehouse = { id: 'wh-1', slug: 'wh-slug', isActive: true } as Warehouse;
  const requester = { id: 'u1', slug: 'u1-slug', firstName: 'An', lastName: 'Nguyen' } as User;
  const approver = { id: 'u2', slug: 'u2-slug', firstName: 'Binh', lastName: 'Tran' } as User;

  const stockBatch = (overrides: Partial<MaterialBatch> = {}) =>
    ({
      id: 'batch-1',
      slug: 'batch-slug',
      expiryDate: '2027-01-01',
      status: MaterialBatchStatus.InStock,
      material: cement,
      warehouse,
      ...overrides,
    }) as MaterialBatch;

  const createDto: CreateExportFormRequestDto = {
    type: ExportFormType.Sale,
    purchaseOrder: 'PO-1',
    receiver: 'Xuong A',
    items: [
      { materialSlug: 'cement', unitSlug: 'bag', quantity: 2, unitPrice: 400 },
      { materialSlug: 'cement', unitSlug: 'kg', quantity: 0.5, unitPrice: 9.99 },
    ],
  };

  const actor = (scope: string[] = [], userId = 'u1', roleName?: string): CurrentUserDto => ({
    userId,
    roleName,
    scope,
  });

  const draft = (overrides: Partial<ExportForm> = {}): ExportForm =>
    ({
      id: 'form-1',
      slug: 'form-slug',
      code: 'PX-0001',
      type: ExportFormType.Sale,
      purchaseOrder: 'PO-1',
      receiver: 'Xuong A',
      requester,
      requesterName: 'Nguyen An',
      approver: null,
      approverName: null,
      totalAmount: 0,
      status: ExportFormStatus.Draft,
      warehouse,
      version: 1,
      createdAt: new Date('2026-10-12T00:00:00Z'),
      updatedAt: new Date('2026-10-12T00:00:00Z'),
      ...overrides,
    }) as ExportForm;

  const expectError = async (promise: Promise<unknown>, code: number) => {
    await expect(promise).rejects.toMatchObject({ code });
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    exportFormRepository.create.mockImplementation((data) => data);
    manager.save.mockImplementation(async (data) => data);
    transactionManager.execute.mockImplementation(async (onSave) => onSave(manager));
    codeGenerateService.generate.mockResolvedValue(generatedCode);
    inventoryRepository.find.mockImplementation(allAssigned);
    batchRepository.find.mockResolvedValue([]);
    materialBatchService.reserve.mockResolvedValue(new Map());
    // Bản đã khoá (`lockForm`) mặc định khớp phiếu nháp version 1.
    manager.findOne.mockImplementation(async () => draft());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportFormService,
        ExportFormProfile,
        { provide: getRepositoryToken(ExportForm), useValue: exportFormRepository },
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Material), useValue: materialRepository },
        { provide: getRepositoryToken(Inventory), useValue: inventoryRepository },
        { provide: getRepositoryToken(MaterialBatch), useValue: batchRepository },
        { provide: TransactionManagerService, useValue: transactionManager },
        { provide: CodeGenerateService, useValue: codeGenerateService },
        { provide: InventoryService, useValue: inventoryService },
        { provide: MaterialBatchService, useValue: materialBatchService },
        { provide: S3Service, useValue: s3Service },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
      ],
    }).compile();
    await module.init();
    service = module.get(ExportFormService);
  });

  describe('createExportForm', () => {
    beforeEach(() => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);
      exportFormRepository.findOne.mockResolvedValue(null);
      userRepository.findOneBy.mockResolvedValue(requester);
      materialRepository.find.mockResolvedValue([cement]);
    });

    it('creates a DRAFT with snapshotted lines, base quantity, amount and totalAmount', async () => {
      const result = await service.createExportForm('wh-slug', createDto, actor());

      const form = manager.save.mock.calls[0][0];
      expect(codeGenerateService.generate).toHaveBeenCalledWith(
        manager,
        CodeType.ExportForm,
        warehouse,
      );
      expect(form).toMatchObject({
        code: generatedCode,
        type: ExportFormType.Sale,
        purchaseOrder: 'PO-1',
        invoiceCode: null,
        receiver: 'Xuong A',
        status: ExportFormStatus.Draft,
        requesterName: 'Nguyen An',
        totalAmount: 805,
      });
      const items = manager.save.mock.calls[1][0];
      expect(items[0]).toBeInstanceOf(ExportFormItem);
      expect(items).toEqual([
        expect.objectContaining({
          lineNo: 1,
          unit: bag,
          quantity: 2,
          conversionRate: 50,
          baseQuantity: 100,
          amount: 800,
          batch: null,
        }),
        expect.objectContaining({ lineNo: 2, unit: kg, baseQuantity: 0.5, amount: 5 }),
      ]);
      expect(result).toMatchObject({ status: ExportFormStatus.Draft, totalAmount: 805 });
    });

    describe('reserves at draft time', () => {
      const b1 = { id: 'b1', slug: 'b1-slug' } as MaterialBatch;
      const b2 = { id: 'b2', slug: 'b2-slug' } as MaterialBatch;

      /** Lần lưu dòng đầu tiên cấp `id` (key của `reserve`); phần tách thêm sau đó không có `id`. */
      beforeEach(() => {
        let linesSaved = false;
        manager.save.mockImplementation(async (data) => {
          if (Array.isArray(data) && !linesSaved) {
            data.forEach((item, index) => (item.id = `i${index + 1}`));
            linesSaved = true;
          }
          return data;
        });
      });

      it('reserves batches + stock and splits a multi-batch line', async () => {
        materialBatchService.reserve.mockResolvedValue(
          new Map([
            [
              'i1',
              [
                { batch: b1, baseQuantity: 60 },
                { batch: b2, baseQuantity: 40 },
              ],
            ],
            ['i2', [{ batch: b2, baseQuantity: 0.5 }]],
          ]),
        );
        const u1 = actor();

        const result = await service.createExportForm('wh-slug', createDto, u1);

        expect(materialBatchService.reserve).toHaveBeenCalledWith(manager, 'wh-1', [
          { key: 'i1', materialId: 'mat-1', baseQuantity: 100, batchId: null },
          { key: 'i2', materialId: 'mat-1', baseQuantity: 0.5, batchId: null },
        ]);
        // Tồn giữ chỗ theo lượng GỐC của dòng (trước khi tách).
        expect(inventoryService.reserve).toHaveBeenCalledWith(
          manager,
          'wh-1',
          [
            { materialId: 'mat-1', quantity: 100 },
            { materialId: 'mat-1', quantity: 0.5 },
          ],
          u1,
          `Export form ${generatedCode} drafted`,
        );

        const split: ExportFormItem[] = manager.save.mock.calls[2][0];
        expect(
          split.map(({ id, lineNo, batch, quantity, baseQuantity, amount }) => ({
            id,
            lineNo,
            batch: batch?.id,
            quantity,
            baseQuantity,
            amount,
          })),
        ).toEqual([
          { id: 'i1', lineNo: 1, batch: 'b1', quantity: 1.2, baseQuantity: 60, amount: 480 },
          { id: undefined, lineNo: 2, batch: 'b2', quantity: 0.8, baseQuantity: 40, amount: 320 },
          { id: 'i2', lineNo: 3, batch: 'b2', quantity: 0.5, baseQuantity: 0.5, amount: 5 },
        ]);
        expect(split[1]).toBeInstanceOf(ExportFormItem);
        expect(split[1]).toMatchObject({ unit: bag, unitPrice: 400, conversionRate: 50 });
        expect(result).toMatchObject({ status: ExportFormStatus.Draft, totalAmount: 805 });
        expect(result.items?.map((item) => item.batchSlug)).toEqual([
          'b1-slug',
          'b2-slug',
          'b2-slug',
        ]);
      });

      it('the last split piece absorbs rounding so quantity and amount add up exactly', async () => {
        materialBatchService.reserve.mockResolvedValue(
          new Map([
            [
              'i1',
              [
                { batch: b1, baseQuantity: 16.666667 },
                { batch: b2, baseQuantity: 33.333333 },
              ],
            ],
          ]),
        );
        const dto = {
          ...createDto,
          items: [{ materialSlug: 'cement', unitSlug: 'bag', quantity: 1, unitPrice: 10 }],
        };

        await service.createExportForm('wh-slug', dto, actor());

        const split: ExportFormItem[] = manager.save.mock.calls[2][0];
        expect(split.map(({ quantity, amount }) => ({ quantity, amount }))).toEqual([
          { quantity: 0.333333, amount: 3.33 },
          { quantity: 0.666667, amount: 6.67 },
        ]);
      });

      it('propagates a batch shortage so the whole draft rolls back', async () => {
        materialBatchService.reserve.mockRejectedValue(
          new MaterialBatchException(MaterialBatchValidation.MATERIAL_BATCH_INSUFFICIENT),
        );

        await expectError(
          service.createExportForm('wh-slug', createDto, actor()),
          MaterialBatchValidation.MATERIAL_BATCH_INSUFFICIENT.code,
        );
        expect(inventoryService.reserve).not.toHaveBeenCalled();
      });

      it('propagates a stock shortage so the whole draft rolls back', async () => {
        inventoryService.reserve.mockRejectedValue(
          new InventoryException(InventoryValidation.INVENTORY_AVAILABLE_INSUFFICIENT),
        );

        await expectError(
          service.createExportForm('wh-slug', createDto, actor()),
          InventoryValidation.INVENTORY_AVAILABLE_INSUFFICIENT.code,
        );
      });
    });

    it('rejects an inactive warehouse', async () => {
      warehouseRepository.findOneBy.mockResolvedValue({ ...warehouse, isActive: false });
      await expectError(
        service.createExportForm('wh-slug', createDto, actor()),
        ExportFormValidation.EXPORT_FORM_WAREHOUSE_INACTIVE.code,
      );
    });

    it('rejects a duplicated (material, unit, batch) line', async () => {
      const dto = { ...createDto, items: [createDto.items[0], createDto.items[0]] };
      await expectError(
        service.createExportForm('wh-slug', dto, actor()),
        ExportFormValidation.EXPORT_FORM_ITEM_DUPLICATED.code,
      );
    });

    it('allows the same material/unit twice when the batches differ', async () => {
      batchRepository.find.mockResolvedValue([
        stockBatch({ id: 'b1', slug: 'b1' }),
        stockBatch({ id: 'b2', slug: 'b2' }),
      ]);
      const line = createDto.items[0];
      const dto = {
        ...createDto,
        items: [
          { ...line, batchSlug: 'b1' },
          { ...line, batchSlug: 'b2' },
        ],
      };

      await service.createExportForm('wh-slug', dto, actor());

      const items = manager.save.mock.calls[1][0];
      expect(items.map((item: ExportFormItem) => item.batch?.id)).toEqual(['b1', 'b2']);
    });

    it('rejects a material not assigned to the warehouse', async () => {
      inventoryRepository.find.mockResolvedValue([]);
      await expectError(
        service.createExportForm('wh-slug', createDto, actor()),
        ExportFormValidation.EXPORT_FORM_ITEM_MATERIAL_NOT_IN_WAREHOUSE.code,
      );
    });

    it.each([
      ['unknown', [], ExportFormValidation.EXPORT_FORM_ITEM_BATCH_NOT_FOUND],
      [
        'in another warehouse',
        [stockBatch({ warehouse: { id: 'wh-2' } as Warehouse })],
        ExportFormValidation.EXPORT_FORM_ITEM_BATCH_NOT_FOUND,
      ],
      [
        'of another material',
        [stockBatch({ material: { id: 'mat-2' } as Material })],
        ExportFormValidation.EXPORT_FORM_ITEM_BATCH_NOT_OF_MATERIAL,
      ],
      [
        'already issued',
        [stockBatch({ status: MaterialBatchStatus.Issued })],
        ExportFormValidation.EXPORT_FORM_ITEM_BATCH_OUT_OF_STOCK,
      ],
    ])('rejects a chosen batch that is %s', async (_, batches, error) => {
      // Lô `RESERVED` vẫn chọn được — đủ phần trống hay không do `reserve` quyết dưới khoá.
      batchRepository.find.mockResolvedValue(batches);
      const dto = { ...createDto, items: [{ ...createDto.items[0], batchSlug: 'batch-slug' }] };

      await expectError(service.createExportForm('wh-slug', dto, actor()), error.code);
      expect(manager.save).not.toHaveBeenCalled();
    });
    it('requires a non-empty file when creating a DISPOSAL export form', async () => {
      await expectError(
        service.createExportForm(
          'wh-slug',
          { ...createDto, type: ExportFormType.Disposal, file: undefined },
          actor(),
        ),
        ExportFormValidation.EXPORT_FORM_FILE_IS_REQUIRED.code,
      );
      await expectError(
        service.createExportForm(
          'wh-slug',
          { ...createDto, type: ExportFormType.Disposal, file: '   ' },
          actor(),
        ),
        ExportFormValidation.EXPORT_FORM_FILE_IS_REQUIRED.code,
      );
      expect(manager.save).not.toHaveBeenCalled();

      await expect(
        service.createExportForm(
          'wh-slug',
          { ...createDto, type: ExportFormType.Disposal, file: 'https://s3.test/bien-ban.pdf' },
          actor(),
        ),
      ).resolves.toMatchObject({ type: ExportFormType.Disposal });
    });
  });

  describe('updateExportForm — partial (PATCH)', () => {
    it('keeps fields and lines that are not sent', async () => {
      const items = [{ id: 'i1', lineNo: 1 }] as ExportFormItem[];
      exportFormRepository.findOne.mockResolvedValue(draft({ items }));

      const result = await service.updateExportForm(
        'wh-slug',
        'form-slug',
        { version: 1, receiver: 'Xuong B' },
        actor([AuthorityCode.ExportFormUpdateDraft]),
      );

      expect(exportFormRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ lock: { mode: 'optimistic', version: 1 } }),
      );
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ receiver: 'Xuong B', purchaseOrder: 'PO-1', code: 'PX-0001' }),
      );
      expect(manager.delete).not.toHaveBeenCalled();
      expect(materialBatchService.release).not.toHaveBeenCalled();
      expect(materialBatchService.reserve).not.toHaveBeenCalled();
      expect(result.items).toHaveLength(1);
    });

    it('replaces every line: releases the old reservation, then reserves the new lines', async () => {
      const old = { id: 'old-1', material: cement, baseQuantity: 5, batch: stockBatch() };
      exportFormRepository.findOne.mockResolvedValue(
        draft({ items: [old] as unknown as ExportFormItem[] }),
      );
      materialRepository.find.mockResolvedValue([cement]);
      const u = actor([AuthorityCode.ExportFormUpdateDraft]);

      await service.updateExportForm(
        'wh-slug',
        'form-slug',
        { version: 1, items: [createDto.items[0]] },
        u,
      );

      expect(manager.findOne).toHaveBeenCalledWith(ExportForm, {
        where: { id: 'form-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(materialBatchService.release).toHaveBeenCalledWith(manager, 'wh-1', [
        { key: 'old-1', materialId: 'mat-1', baseQuantity: 5, batchId: 'batch-1' },
      ]);
      expect(inventoryService.release).toHaveBeenCalledWith(
        manager,
        'wh-1',
        [{ materialId: 'mat-1', quantity: 5 }],
        u,
        'Export form PX-0001 lines replaced',
      );
      expect(manager.delete).toHaveBeenCalledWith(ExportFormItem, ['old-1']);
      expect(materialBatchService.reserve).toHaveBeenCalledWith(manager, 'wh-1', [
        expect.objectContaining({ materialId: 'mat-1', baseQuantity: 100, batchId: null }),
      ]);
      expect(materialBatchService.release.mock.invocationCallOrder[0]).toBeLessThan(
        materialBatchService.reserve.mock.invocationCallOrder[0],
      );
      expect(manager.save.mock.calls[0][0]).toMatchObject({ totalAmount: 800 });
    });

    it('re-checks status and version on the locked row before touching reservations', async () => {
      exportFormRepository.findOne.mockResolvedValue(draft({ items: [] }));
      materialRepository.find.mockResolvedValue([cement]);
      manager.findOne.mockResolvedValue(draft({ version: 2 }));

      await expect(
        service.updateExportForm(
          'wh-slug',
          'form-slug',
          { version: 1, items: [createDto.items[0]] },
          actor([AuthorityCode.ExportFormUpdateDraft]),
        ),
      ).rejects.toBeInstanceOf(OptimisticLockVersionMismatchError);
      expect(materialBatchService.reserve).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('_OWN can only update forms they requested', async () => {
      exportFormRepository.findOne.mockResolvedValue(draft());
      await expectError(
        service.updateExportForm(
          'wh-slug',
          'form-slug',
          { version: 1, note: 'x' },
          actor([AuthorityCode.ExportFormUpdateDraftOwn], 'someone-else'),
        ),
        ExportFormValidation.EXPORT_FORM_NOT_OWNER.code,
      );
    });

    it('rejects a non-DRAFT form', async () => {
      exportFormRepository.findOne.mockResolvedValue(draft({ status: ExportFormStatus.Confirmed }));
      await expectError(
        service.updateExportForm(
          'wh-slug',
          'form-slug',
          { version: 1 },
          actor([AuthorityCode.ExportFormUpdateDraft]),
        ),
        ExportFormValidation.EXPORT_FORM_NOT_DRAFT.code,
      );
    });

    it('requires a file when switching to DISPOSAL or updating a DISPOSAL draft', async () => {
      exportFormRepository.findOne.mockResolvedValue(
        draft({ type: ExportFormType.Sale, file: null }),
      );
      await expectError(
        service.updateExportForm(
          'wh-slug',
          'form-slug',
          { version: 1, type: ExportFormType.Disposal },
          actor([AuthorityCode.ExportFormUpdateDraft]),
        ),
        ExportFormValidation.EXPORT_FORM_FILE_IS_REQUIRED.code,
      );

      exportFormRepository.findOne.mockResolvedValue(
        draft({ type: ExportFormType.Disposal, file: 'https://s3.test/bien-ban.pdf' }),
      );
      await expectError(
        service.updateExportForm(
          'wh-slug',
          'form-slug',
          { version: 1, file: '' },
          actor([AuthorityCode.ExportFormUpdateDraft]),
        ),
        ExportFormValidation.EXPORT_FORM_FILE_IS_REQUIRED.code,
      );
      expect(manager.save).not.toHaveBeenCalled();

      await expect(
        service.updateExportForm(
          'wh-slug',
          'form-slug',
          { version: 1, receiver: 'Tổ tiêu huỷ' },
          actor([AuthorityCode.ExportFormUpdateDraft]),
        ),
      ).resolves.toMatchObject({ receiver: 'Tổ tiêu huỷ' });
    });
  });

  describe('findAll', () => {
    it('returns each form with its material lines', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);
      const item = {
        id: 'item-1',
        slug: 'item-slug',
        lineNo: 1,
        material: cement,
        materialCode: 'XM-01',
        materialName: 'Xi mang',
        unit: bag,
        unitCode: 'BAO',
        unitName: 'Bao',
        batch: stockBatch(),
        quantity: 2,
        conversionRate: 50,
        baseQuantity: 100,
        unitPrice: 400,
        amount: 800,
        createdAt: new Date('2026-10-12T00:00:00Z'),
        updatedAt: new Date('2026-10-12T00:00:00Z'),
      } as unknown as ExportFormItem;
      exportFormRepository.findAndCount.mockResolvedValue([[draft({ items: [item] })], 1]);

      const result = await service.findAll('wh-slug', { page: 1, size: 10 } as never);

      expect(exportFormRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: expect.objectContaining({
            items: { material: true, unit: true, batch: true },
          }),
          order: expect.objectContaining({ items: { lineNo: 'ASC' } }),
        }),
      );
      expect(result.items[0].items).toEqual([
        expect.objectContaining({
          lineNo: 1,
          materialSlug: 'cement',
          unitSlug: 'bag',
          batchSlug: 'batch-slug',
          quantity: 2,
          amount: 800,
        }),
      ]);
    });
  });

  describe('deleteExportForm', () => {
    it('gives the reservation back and soft removes a DRAFT the user may delete', async () => {
      const line = { id: 'i1', material: cement, baseQuantity: 5, batch: stockBatch() };
      const form = draft({ items: [line] as unknown as ExportFormItem[] });
      exportFormRepository.findOne.mockResolvedValue(form);
      const u = actor([AuthorityCode.ExportFormDeleteDraft]);

      await expect(service.deleteExportForm('wh-slug', 'form-slug', u)).resolves.toBe(1);
      expect(materialBatchService.release).toHaveBeenCalledWith(manager, 'wh-1', [
        { key: 'i1', materialId: 'mat-1', baseQuantity: 5, batchId: 'batch-1' },
      ]);
      expect(inventoryService.release).toHaveBeenCalledWith(
        manager,
        'wh-1',
        [{ materialId: 'mat-1', quantity: 5 }],
        u,
        'Export form PX-0001 deleted',
      );
      expect(manager.softRemove).toHaveBeenCalledWith(form);
    });

    it('is forbidden without any delete authority', async () => {
      exportFormRepository.findOne.mockResolvedValue(draft());
      await expect(
        service.deleteExportForm('wh-slug', 'form-slug', actor([])),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('submit / confirm / cancel', () => {
    const b1 = { id: 'b1', slug: 'b1-slug', expiryDate: '2026-11-01' } as MaterialBatch;
    const b2 = { id: 'b2', slug: 'b2-slug', expiryDate: '2027-01-01' } as MaterialBatch;
    const lineA = () =>
      ({
        id: 'i1',
        lineNo: 1,
        material: cement,
        materialCode: 'XM-01',
        materialName: 'Xi mang',
        unit: bag,
        unitCode: 'BAO',
        unitName: 'Bao',
        quantity: 3,
        conversionRate: 50,
        baseQuantity: 150,
        unitPrice: 100.01,
        amount: 300.03,
        batch: null,
      }) as unknown as ExportFormItem;
    const lineB = () =>
      ({
        ...lineA(),
        id: 'i2',
        lineNo: 2,
        unit: kg,
        quantity: 5,
        conversionRate: 1,
        baseQuantity: 5,
        unitPrice: 2,
        amount: 10,
        batch: b2,
      }) as unknown as ExportFormItem;

    const pending = (overrides: Partial<ExportForm> = {}) =>
      draft({ status: ExportFormStatus.Pending, ...overrides });
    const owner = () => actor([AuthorityCode.ExportFormUpdateDraftOwn], 'u1');

    beforeEach(() => {
      userRepository.findOneBy.mockResolvedValue(approver);
      manager.findOne.mockImplementation(async () => draft());
    });

    describe('submit (DRAFT -> PENDING)', () => {
      it('only flips the status: the draft already holds its batches and stock', async () => {
        const a = { ...lineA(), batch: b1 } as ExportFormItem;
        const b = lineB();
        exportFormRepository.findOne.mockResolvedValue(draft({ items: [a, b] }));

        const result = await service.submitExportForm(
          'wh-slug',
          'form-slug',
          { version: 1 },
          owner(),
        );

        expect(materialBatchService.reserve).not.toHaveBeenCalled();
        expect(inventoryService.reserve).not.toHaveBeenCalled();
        expect(manager.save.mock.calls.some(([arg]) => Array.isArray(arg))).toBe(false);
        expect(result).toMatchObject({ status: ExportFormStatus.Pending, approverSlug: null });
        expect(result.items?.map((item) => item.batchSlug)).toEqual(['b1-slug', 'b2-slug']);
      });

      it('needs the update-draft authority (or _OWN on own form)', async () => {
        exportFormRepository.findOne.mockResolvedValue(draft({ items: [lineA()] }));

        await expect(
          service.submitExportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u1')),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expectError(
          service.submitExportForm(
            'wh-slug',
            'form-slug',
            { version: 1 },
            actor([AuthorityCode.ExportFormUpdateDraftOwn], 'u2'),
          ),
          ExportFormValidation.EXPORT_FORM_NOT_OWNER.code,
        );
        expect(transactionManager.execute).not.toHaveBeenCalled();
      });

      it('re-checks status and version on the pessimistically locked row', async () => {
        exportFormRepository.findOne.mockResolvedValue(draft({ items: [lineA()] }));
        manager.findOne.mockResolvedValue(pending({ version: 2 }));

        await expectError(
          service.submitExportForm('wh-slug', 'form-slug', { version: 1 }, owner()),
          ExportFormValidation.EXPORT_FORM_NOT_DRAFT.code,
        );
        expect(manager.findOne).toHaveBeenCalledWith(ExportForm, {
          where: { id: 'form-1' },
          lock: { mode: 'pessimistic_write' },
        });
        expect(manager.save).not.toHaveBeenCalled();

        manager.findOne.mockResolvedValue(draft({ version: 2 }));
        await expect(
          service.submitExportForm('wh-slug', 'form-slug', { version: 1 }, owner()),
        ).rejects.toBeInstanceOf(OptimisticLockVersionMismatchError);
      });

      it('a PENDING form can no longer be edited, deleted or submitted again', async () => {
        exportFormRepository.findOne.mockResolvedValue(pending());
        const full = actor([
          AuthorityCode.ExportFormUpdateDraft,
          AuthorityCode.ExportFormDeleteDraft,
        ]);
        const code = ExportFormValidation.EXPORT_FORM_NOT_DRAFT.code;

        await expectError(
          service.submitExportForm('wh-slug', 'form-slug', { version: 1 }, full),
          code,
        );
        await expectError(
          service.updateExportForm('wh-slug', 'form-slug', { version: 1 }, full),
          code,
        );
        await expectError(service.deleteExportForm('wh-slug', 'form-slug', full), code);
      });

      it('rejects submitting a DISPOSAL draft that has no attached file', async () => {
        exportFormRepository.findOne.mockResolvedValue(
          draft({ type: ExportFormType.Disposal, file: null, items: [lineA()] }),
        );
        await expectError(
          service.submitExportForm('wh-slug', 'form-slug', { version: 1 }, owner()),
          ExportFormValidation.EXPORT_FORM_FILE_IS_REQUIRED.code,
        );
        expect(transactionManager.execute).not.toHaveBeenCalled();
      });
    });

    describe('confirm (PENDING -> CONFIRMED)', () => {
      beforeEach(() => manager.findOne.mockImplementation(async () => pending()));

      it('takes the reserved batches and reserved stock, without re-picking or splitting', async () => {
        const a = { ...lineA(), batch: b1 } as ExportFormItem;
        const b = lineB();
        exportFormRepository.findOne.mockResolvedValue(pending({ items: [a, b] }));
        const u2 = actor([], 'u2');

        const result = await service.confirmExportForm('wh-slug', 'form-slug', { version: 1 }, u2);

        expect(materialBatchService.consumeReserved).toHaveBeenCalledWith(
          manager,
          'wh-1',
          [
            { key: 'i1', materialId: 'mat-1', baseQuantity: 150, batchId: 'b1' },
            { key: 'i2', materialId: 'mat-1', baseQuantity: 5, batchId: 'b2' },
          ],
          ExportFormType.Sale,
        );
        expect(inventoryService.issue).toHaveBeenCalledWith(
          manager,
          'wh-1',
          [
            { materialId: 'mat-1', quantity: 150 },
            { materialId: 'mat-1', quantity: 5 },
          ],
          u2,
          'Export form PX-0001',
          { fromReserved: true },
        );
        expect(materialBatchService.reserve).not.toHaveBeenCalled();
        expect(manager.save.mock.calls.some(([arg]) => Array.isArray(arg))).toBe(false);
        expect(result).toMatchObject({
          status: ExportFormStatus.Confirmed,
          approverSlug: 'u2-slug',
          approverName: 'Tran Binh',
        });
      });

      it('a DRAFT must be submitted first', async () => {
        exportFormRepository.findOne.mockResolvedValue(draft({ items: [lineA()] }));

        await expectError(
          service.confirmExportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
          ExportFormValidation.EXPORT_FORM_NOT_PENDING.code,
        );
        expect(transactionManager.execute).not.toHaveBeenCalled();
      });

      it.each([ExportFormStatus.Confirmed, ExportFormStatus.Cancelled])(
        'cannot confirm a %s form again',
        async (status) => {
          exportFormRepository.findOne.mockResolvedValue(draft({ status }));
          await expectError(
            service.confirmExportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
            ExportFormValidation.EXPORT_FORM_NOT_PENDING.code,
          );
        },
      );

      it('a DISPOSAL form needs EXPORT_FORM_APPROVE_DISPOSAL to be confirmed', async () => {
        exportFormRepository.findOne.mockResolvedValue(pending({ type: ExportFormType.Disposal }));

        await expect(
          service.confirmExportForm(
            'wh-slug',
            'form-slug',
            { version: 1 },
            actor([AuthorityCode.ExportFormConfirm], 'u2'),
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(transactionManager.execute).not.toHaveBeenCalled();
      });

      it('a DISPOSAL form is confirmed with EXPORT_FORM_APPROVE_DISPOSAL (or by SUPER_ADMIN)', async () => {
        // Bản mới mỗi lần: lần xác nhận đầu sửa trạng thái của object trả về.
        exportFormRepository.findOne.mockImplementation(async () =>
          pending({
            type: ExportFormType.Disposal,
            file: 'https://s3.test/bien-ban.pdf',
            items: [],
          }),
        );

        await expect(
          service.confirmExportForm(
            'wh-slug',
            'form-slug',
            { version: 1 },
            actor([AuthorityCode.ExportFormConfirm, AuthorityCode.ExportFormApproveDisposal], 'u2'),
          ),
        ).resolves.toMatchObject({ status: ExportFormStatus.Confirmed });
        // Lô xuất hết của phiếu huỷ ⇒ `DISPOSED` (`MaterialBatchService` quyết theo `type`).
        expect(materialBatchService.consumeReserved).toHaveBeenCalledWith(
          manager,
          'wh-1',
          [],
          ExportFormType.Disposal,
        );
        await expect(
          service.confirmExportForm(
            'wh-slug',
            'form-slug',
            { version: 1 },
            actor([], 'u2', RoleEnum.SuperAdmin),
          ),
        ).resolves.toBeDefined();
      });

      it('rejects confirming a PENDING DISPOSAL form that has no attached file', async () => {
        exportFormRepository.findOne.mockResolvedValue(
          pending({ type: ExportFormType.Disposal, file: null, items: [lineA()] }),
        );
        await expectError(
          service.confirmExportForm(
            'wh-slug',
            'form-slug',
            { version: 1 },
            actor([AuthorityCode.ExportFormConfirm, AuthorityCode.ExportFormApproveDisposal], 'u2'),
          ),
          ExportFormValidation.EXPORT_FORM_FILE_IS_REQUIRED.code,
        );
        expect(transactionManager.execute).not.toHaveBeenCalled();
      });

      it('propagates a reserved-batch mismatch so the transaction rolls back', async () => {
        exportFormRepository.findOne.mockResolvedValue(pending({ items: [lineB()] }));
        materialBatchService.consumeReserved.mockRejectedValue(
          new MaterialBatchException(MaterialBatchValidation.MATERIAL_BATCH_RESERVED_INVALID),
        );

        await expectError(
          service.confirmExportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
          MaterialBatchValidation.MATERIAL_BATCH_RESERVED_INVALID.code,
        );
        expect(inventoryService.issue).not.toHaveBeenCalled();
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('re-checks status on the pessimistically locked row', async () => {
        exportFormRepository.findOne.mockResolvedValue(pending({ items: [lineB()] }));
        manager.findOne.mockResolvedValue(draft({ status: ExportFormStatus.Confirmed }));

        await expectError(
          service.confirmExportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
          ExportFormValidation.EXPORT_FORM_NOT_PENDING.code,
        );
        expect(materialBatchService.consumeReserved).not.toHaveBeenCalled();
      });
    });

    describe('cancel', () => {
      it('cancelling a DRAFT gives its reservation back too', async () => {
        exportFormRepository.findOne.mockResolvedValue(draft({ items: [lineB()] }));
        const u2 = actor([], 'u2');

        const result = await service.cancelExportForm('wh-slug', 'form-slug', { version: 1 }, u2);

        expect(materialBatchService.release).toHaveBeenCalledWith(manager, 'wh-1', [
          { key: 'i2', materialId: 'mat-1', baseQuantity: 5, batchId: 'b2' },
        ]);
        expect(inventoryService.release).toHaveBeenCalledWith(
          manager,
          'wh-1',
          [{ materialId: 'mat-1', quantity: 5 }],
          u2,
          'Export form PX-0001 cancelled',
        );
        expect(result.status).toBe(ExportFormStatus.Cancelled);
      });

      it('cancelling a PENDING form gives the reserved quantity back', async () => {
        exportFormRepository.findOne.mockResolvedValue(pending({ items: [lineB()] }));
        manager.findOne.mockResolvedValue(pending());
        const u2 = actor([], 'u2');

        const result = await service.cancelExportForm('wh-slug', 'form-slug', { version: 1 }, u2);

        expect(materialBatchService.release).toHaveBeenCalledWith(manager, 'wh-1', [
          { key: 'i2', materialId: 'mat-1', baseQuantity: 5, batchId: 'b2' },
        ]);
        expect(inventoryService.release).toHaveBeenCalledWith(
          manager,
          'wh-1',
          [{ materialId: 'mat-1', quantity: 5 }],
          u2,
          'Export form PX-0001 cancelled',
        );
        expect(result).toMatchObject({
          status: ExportFormStatus.Cancelled,
          approverSlug: 'u2-slug',
        });
      });

      it('cancelling a DISPOSAL form does not need the approval authority', async () => {
        exportFormRepository.findOne.mockResolvedValue(draft({ type: ExportFormType.Disposal }));

        await expect(
          service.cancelExportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
        ).resolves.toMatchObject({ status: ExportFormStatus.Cancelled });
      });

      it.each([ExportFormStatus.Confirmed, ExportFormStatus.Cancelled])(
        'cannot cancel a %s form',
        async (status) => {
          exportFormRepository.findOne.mockResolvedValue(draft({ status }));
          await expectError(
            service.cancelExportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
            ExportFormValidation.EXPORT_FORM_CANNOT_BE_CANCELLED.code,
          );
        },
      );

      it('fails if the form changed status before the lock was taken', async () => {
        exportFormRepository.findOne.mockResolvedValue(pending({ items: [lineB()] }));
        manager.findOne.mockResolvedValue(draft({ status: ExportFormStatus.Confirmed }));

        await expectError(
          service.cancelExportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
          ExportFormValidation.EXPORT_FORM_CANNOT_BE_CANCELLED.code,
        );
        expect(materialBatchService.release).not.toHaveBeenCalled();
      });
    });
  });

  describe('uploadFile', () => {
    const file = { originalname: 'a.pdf', mimetype: 'application/pdf' } as Express.Multer.File;

    beforeEach(() => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);
    });

    it('uploads into the export-forms folder', async () => {
      s3Service.uploadFile.mockResolvedValue('export-forms/a.pdf');
      s3Service.getFileUrl.mockReturnValue('https://bucket/export-forms/a.pdf');

      await expect(
        service.uploadFile('wh-slug', file, actor([AuthorityCode.ExportFormUpdateDraftOwn])),
      ).resolves.toBe('https://bucket/export-forms/a.pdf');
      expect(warehouseRepository.findOneBy).toHaveBeenCalledWith({ slug: 'wh-slug' });
      expect(s3Service.uploadFile).toHaveBeenCalledWith(file, 'export-forms');
    });

    it('is forbidden without create/update authority', async () => {
      await expect(service.uploadFile('wh-slug', file, actor([]))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects an unknown warehouse without uploading', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(null);

      await expectError(
        service.uploadFile('missing', file, actor([AuthorityCode.ExportFormCreate])),
        WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      );
      expect(s3Service.uploadFile).not.toHaveBeenCalled();
    });

    it('rejects an inactive warehouse without uploading', async () => {
      warehouseRepository.findOneBy.mockResolvedValue({ ...warehouse, isActive: false });

      await expectError(
        service.uploadFile('wh-slug', file, actor([AuthorityCode.ExportFormCreate])),
        ExportFormValidation.EXPORT_FORM_WAREHOUSE_INACTIVE.code,
      );
      expect(s3Service.uploadFile).not.toHaveBeenCalled();
    });

    it('rejects a file type that is not allowed', async () => {
      await expectError(
        service.uploadFile(
          'wh-slug',
          { originalname: 'x.html', mimetype: 'text/html' } as Express.Multer.File,
          actor([AuthorityCode.ExportFormCreate]),
        ),
        ExportFormValidation.EXPORT_FORM_FILE_TYPE_NOT_ALLOWED.code,
      );
    });

    // #184: đuôi phải khớp mimetype — `x.html` khai `application/pdf` bị chặn với mã cũ, không lên S3.
    it.each([
      ['x.html', 'application/pdf'],
      ['x.png', 'application/pdf'],
    ])('rejects %s declared as %s without touching S3', async (originalname, mimetype) => {
      await expectError(
        service.uploadFile(
          'wh-slug',
          { originalname, mimetype } as Express.Multer.File,
          actor([AuthorityCode.ExportFormCreate]),
        ),
        ExportFormValidation.EXPORT_FORM_FILE_TYPE_NOT_ALLOWED.code,
      );
      expect(s3Service.uploadFile).not.toHaveBeenCalled();
    });
  });
});
