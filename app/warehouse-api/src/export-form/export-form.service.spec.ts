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
  const manager = { save: jest.fn(), delete: jest.fn(), findOne: jest.fn() };
  const inventoryService = { issue: jest.fn() };
  const materialBatchService = { consume: jest.fn() };
  const transactionManager = { execute: jest.fn() };
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
    code: 'px-0001',
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
    inventoryRepository.find.mockImplementation(allAssigned);
    batchRepository.find.mockResolvedValue([]);

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
      expect(form).toMatchObject({
        code: 'PX-0001',
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
      // Phiếu nháp không giữ chỗ: không đụng lô/tồn.
      expect(materialBatchService.consume).not.toHaveBeenCalled();
      expect(inventoryService.issue).not.toHaveBeenCalled();
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
        'out of stock',
        [stockBatch({ status: MaterialBatchStatus.OutOfStock })],
        ExportFormValidation.EXPORT_FORM_ITEM_BATCH_OUT_OF_STOCK,
      ],
    ])('rejects a chosen batch that is %s', async (_, batches, error) => {
      batchRepository.find.mockResolvedValue(batches);
      const dto = { ...createDto, items: [{ ...createDto.items[0], batchSlug: 'batch-slug' }] };

      await expectError(service.createExportForm('wh-slug', dto, actor()), error.code);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects a code already used by a deleted form', async () => {
      exportFormRepository.findOne.mockResolvedValue({ deletedAt: new Date() });
      await expectError(
        service.createExportForm('wh-slug', createDto, actor()),
        ExportFormValidation.EXPORT_FORM_CODE_RESERVED_BY_DELETED_EXPORT_FORM.code,
      );
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
      expect(result.items).toHaveLength(1);
    });

    it('replaces every line and recomputes totalAmount when items are sent', async () => {
      exportFormRepository.findOne.mockResolvedValue(
        draft({ items: [{ id: 'old-1' }] as ExportFormItem[] }),
      );
      materialRepository.find.mockResolvedValue([cement]);

      await service.updateExportForm(
        'wh-slug',
        'form-slug',
        { version: 1, items: [createDto.items[0]] },
        actor([AuthorityCode.ExportFormUpdateDraft]),
      );

      expect(manager.delete).toHaveBeenCalledWith(ExportFormItem, ['old-1']);
      expect(manager.save.mock.calls[0][0]).toMatchObject({ totalAmount: 800 });
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
  });

  describe('deleteExportForm', () => {
    it('soft removes a DRAFT the user may delete', async () => {
      const form = draft();
      exportFormRepository.findOne.mockResolvedValue(form);

      await expect(
        service.deleteExportForm(
          'wh-slug',
          'form-slug',
          actor([AuthorityCode.ExportFormDeleteDraft]),
        ),
      ).resolves.toBe(1);
      expect(exportFormRepository.softRemove).toHaveBeenCalledWith(form);
    });

    it('is forbidden without any delete authority', async () => {
      exportFormRepository.findOne.mockResolvedValue(draft());
      await expect(
        service.deleteExportForm('wh-slug', 'form-slug', actor([])),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('confirm / cancel', () => {
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

    beforeEach(() => {
      userRepository.findOneBy.mockResolvedValue(approver);
      manager.findOne.mockImplementation(async () => draft());
    });

    it('confirm consumes batches, splits a multi-batch line, takes stock and records the approver', async () => {
      const a = lineA();
      const b = lineB();
      exportFormRepository.findOne.mockResolvedValue(draft({ items: [a, b], totalAmount: 310.03 }));
      materialBatchService.consume.mockResolvedValue(
        new Map([
          [
            'i1',
            [
              { batch: b1, baseQuantity: 100 },
              { batch: b2, baseQuantity: 50 },
            ],
          ],
          ['i2', [{ batch: b2, baseQuantity: 5 }]],
        ]),
      );
      const u2 = actor([], 'u2');

      const result = await service.confirmExportForm('wh-slug', 'form-slug', { version: 1 }, u2);

      expect(materialBatchService.consume).toHaveBeenCalledWith(manager, 'wh-1', [
        { key: 'i1', materialId: 'mat-1', baseQuantity: 150, batchId: null },
        { key: 'i2', materialId: 'mat-1', baseQuantity: 5, batchId: 'b2' },
      ]);
      // Tồn trừ theo lượng GỐC của dòng (trước khi tách).
      expect(inventoryService.issue).toHaveBeenCalledWith(
        manager,
        'wh-1',
        [
          { materialId: 'mat-1', quantity: 150 },
          { materialId: 'mat-1', quantity: 5 },
        ],
        u2,
        'Export form PX-0001',
      );

      const saved: ExportFormItem[] = manager.save.mock.calls.find(([arg]) =>
        Array.isArray(arg),
      )[0];
      expect(
        saved.map(({ id, lineNo, batch, quantity, baseQuantity, amount }) => ({
          id,
          lineNo,
          batch: batch?.id,
          quantity,
          baseQuantity,
          amount,
        })),
      ).toEqual([
        { id: 'i1', lineNo: 1, batch: 'b1', quantity: 2, baseQuantity: 100, amount: 200.02 },
        { id: undefined, lineNo: 2, batch: 'b2', quantity: 1, baseQuantity: 50, amount: 100.01 },
        { id: 'i2', lineNo: 3, batch: 'b2', quantity: 5, baseQuantity: 5, amount: 10 },
      ]);
      // Tổng tiền giữ nguyên sau khi tách.
      const totalAfter = saved.reduce((sum, item) => sum + item.amount, 0);
      expect(Number(totalAfter.toFixed(2))).toBe(310.03);
      expect(saved[1]).toBeInstanceOf(ExportFormItem);
      expect(saved[1]).toMatchObject({ unit: bag, unitPrice: 100.01, conversionRate: 50 });

      expect(result).toMatchObject({
        status: ExportFormStatus.Confirmed,
        approverSlug: 'u2-slug',
        approverName: 'Tran Binh',
      });
      expect(result.items?.map((item) => item.batchSlug)).toEqual([
        'b1-slug',
        'b2-slug',
        'b2-slug',
      ]);
    });

    it('the last split piece absorbs rounding so quantity and amount add up exactly', async () => {
      const a = {
        ...lineA(),
        quantity: 1,
        conversionRate: 3,
        baseQuantity: 3,
        unitPrice: 10,
        amount: 10,
      };
      exportFormRepository.findOne.mockResolvedValue(draft({ items: [a as ExportFormItem] }));
      materialBatchService.consume.mockResolvedValue(
        new Map([
          [
            'i1',
            [
              { batch: b1, baseQuantity: 1 },
              { batch: b2, baseQuantity: 2 },
            ],
          ],
        ]),
      );

      await service.confirmExportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2'));

      const saved: ExportFormItem[] = manager.save.mock.calls.find(([arg]) =>
        Array.isArray(arg),
      )[0];
      expect(saved.map(({ quantity, amount }) => ({ quantity, amount }))).toEqual([
        { quantity: 0.333333, amount: 3.33 },
        { quantity: 0.666667, amount: 6.67 },
      ]);
    });

    it('cancel does not touch batches nor stock', async () => {
      exportFormRepository.findOne.mockResolvedValue(draft({ items: [lineA()] }));

      const result = await service.cancelExportForm(
        'wh-slug',
        'form-slug',
        { version: 1 },
        actor([], 'u2'),
      );

      expect(materialBatchService.consume).not.toHaveBeenCalled();
      expect(inventoryService.issue).not.toHaveBeenCalled();
      expect(result.status).toBe(ExportFormStatus.Cancelled);
    });

    it('a DISPOSAL form needs EXPORT_FORM_APPROVE_DISPOSAL to be confirmed', async () => {
      exportFormRepository.findOne.mockResolvedValue(draft({ type: ExportFormType.Disposal }));

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
        draft({ type: ExportFormType.Disposal, items: [] }),
      );
      materialBatchService.consume.mockResolvedValue(new Map());

      await expect(
        service.confirmExportForm(
          'wh-slug',
          'form-slug',
          { version: 1 },
          actor([AuthorityCode.ExportFormConfirm, AuthorityCode.ExportFormApproveDisposal], 'u2'),
        ),
      ).resolves.toMatchObject({ status: ExportFormStatus.Confirmed });
      await expect(
        service.confirmExportForm(
          'wh-slug',
          'form-slug',
          { version: 1 },
          actor([], 'u2', RoleEnum.SuperAdmin),
        ),
      ).resolves.toBeDefined();
    });

    it('cancelling a DISPOSAL form does not need the approval authority', async () => {
      exportFormRepository.findOne.mockResolvedValue(draft({ type: ExportFormType.Disposal }));

      await expect(
        service.cancelExportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
      ).resolves.toMatchObject({ status: ExportFormStatus.Cancelled });
    });

    it('propagates a batch shortage so the transaction rolls back', async () => {
      exportFormRepository.findOne.mockResolvedValue(draft({ items: [lineA()] }));
      materialBatchService.consume.mockRejectedValue(
        new MaterialBatchException(MaterialBatchValidation.MATERIAL_BATCH_INSUFFICIENT),
      );

      await expectError(
        service.confirmExportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
        MaterialBatchValidation.MATERIAL_BATCH_INSUFFICIENT.code,
      );
      expect(inventoryService.issue).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('propagates a stock shortage so the transaction rolls back', async () => {
      exportFormRepository.findOne.mockResolvedValue(draft({ items: [lineA()] }));
      materialBatchService.consume.mockResolvedValue(
        new Map([['i1', [{ batch: b1, baseQuantity: 150 }]]]),
      );
      inventoryService.issue.mockRejectedValue(
        new InventoryException(InventoryValidation.INVENTORY_QUANTITY_NEGATIVE),
      );

      await expectError(
        service.confirmExportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
        InventoryValidation.INVENTORY_QUANTITY_NEGATIVE.code,
      );
    });

    it('re-checks status and version on the pessimistically locked row', async () => {
      exportFormRepository.findOne.mockResolvedValue(draft({ items: [lineA()] }));
      manager.findOne.mockResolvedValue(draft({ status: ExportFormStatus.Confirmed, version: 2 }));

      await expectError(
        service.confirmExportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
        ExportFormValidation.EXPORT_FORM_NOT_DRAFT.code,
      );
      expect(manager.findOne).toHaveBeenCalledWith(ExportForm, {
        where: { id: 'form-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(materialBatchService.consume).not.toHaveBeenCalled();

      manager.findOne.mockResolvedValue(draft({ version: 2 }));
      await expect(
        service.confirmExportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
      ).rejects.toBeInstanceOf(OptimisticLockVersionMismatchError);
    });

    it.each([ExportFormStatus.Confirmed, ExportFormStatus.Cancelled])(
      'cannot confirm a %s form again',
      async (status) => {
        exportFormRepository.findOne.mockResolvedValue(draft({ status }));
        await expectError(
          service.confirmExportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
          ExportFormValidation.EXPORT_FORM_NOT_DRAFT.code,
        );
      },
    );
  });

  describe('uploadFile', () => {
    const file = { mimetype: 'application/pdf' } as Express.Multer.File;

    it('uploads into the export-forms folder', async () => {
      s3Service.uploadFile.mockResolvedValue('export-forms/a.pdf');
      s3Service.getFileUrl.mockReturnValue('https://bucket/export-forms/a.pdf');

      await expect(
        service.uploadFile(file, actor([AuthorityCode.ExportFormUpdateDraftOwn])),
      ).resolves.toBe('https://bucket/export-forms/a.pdf');
      expect(s3Service.uploadFile).toHaveBeenCalledWith(file, 'export-forms');
    });

    it('is forbidden without create/update authority', async () => {
      await expect(service.uploadFile(file, actor([]))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a file type that is not allowed', async () => {
      await expectError(
        service.uploadFile(
          { mimetype: 'text/html' } as Express.Multer.File,
          actor([AuthorityCode.ExportFormCreate]),
        ),
        ExportFormValidation.EXPORT_FORM_FILE_TYPE_NOT_ALLOWED.code,
      );
    });
  });
});
