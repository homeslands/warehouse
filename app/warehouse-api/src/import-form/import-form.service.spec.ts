import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ImportFormService } from './import-form.service';
import { ImportFormProfile } from './import-form.mapper';
import { ImportForm } from './import-form.entity';
import { ImportFormStatus } from './import-form.constants';
import { ImportFormException } from './import-form.exception';
import { ImportFormValidation } from './import-form.validation';
import { CreateImportFormRequestDto } from './import-form.dto';
import { AuthorityCode } from 'src/authority/authority.constants';
import { CurrentUserDto } from 'src/user/user.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { User } from 'src/user/user.entity';
import { Supplier } from 'src/supplier/supplier.entity';
import { SupplierValidation } from 'src/supplier/supplier.validation';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { WarehouseValidation } from 'src/warehouse/warehouse.validation';

describe('ImportFormService', () => {
  let service: ImportFormService;
  const importFormRepository = {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softRemove: jest.fn(),
  };
  const warehouseRepository = { findOneBy: jest.fn() };
  const supplierRepository = { findOneBy: jest.fn() };
  const userRepository = { findOneBy: jest.fn() };

  const warehouse = { id: 'wh-1', slug: 'wh-slug', isActive: true } as Warehouse;
  const supplier = {
    id: 'sup-1',
    slug: 'sup-slug',
    code: 'NCC-01',
    name: 'Supplier A',
    taxCode: '0101234567',
    address: 'Hanoi',
  } as Supplier;
  const requester = { id: 'u1', slug: 'u1-slug', firstName: 'An', lastName: 'Nguyen' } as User;
  const approver = { id: 'u2', slug: 'u2-slug', firstName: 'Binh', lastName: 'Tran' } as User;

  const createDto: CreateImportFormRequestDto = {
    code: 'pn-0001',
    invoiceCode: 'HD-1',
    supplierSlug: 'sup-slug',
    date: '2026-10-12',
    total: 1000,
  };

  const actor = (scope: string[] = [], userId = 'u1', roleName?: string): CurrentUserDto => ({
    userId,
    roleName,
    scope,
  });

  const draft = (overrides: Partial<ImportForm> = {}): ImportForm =>
    ({
      id: 'form-1',
      slug: 'form-slug',
      code: 'PN-0001',
      invoiceCode: 'HD-1',
      supplierName: 'Supplier A',
      supplierCode: 'NCC-01',
      supplierSlug: 'sup-slug',
      requester,
      requesterName: 'Nguyen An',
      approver: null,
      approverName: null,
      date: '2026-10-12',
      total: 1000,
      status: ImportFormStatus.Draft,
      warehouse,
      version: 1,
      createdAt: new Date('2026-10-12T00:00:00Z'),
      updatedAt: new Date('2026-10-12T00:00:00Z'),
      ...overrides,
    }) as ImportForm;

  const expectError = async (promise: Promise<unknown>, code: number) => {
    await expect(promise).rejects.toMatchObject({ code });
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    importFormRepository.create.mockImplementation((data) => data);
    importFormRepository.save.mockImplementation(async (data) => data);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportFormService,
        ImportFormProfile,
        { provide: getRepositoryToken(ImportForm), useValue: importFormRepository },
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepository },
        { provide: getRepositoryToken(Supplier), useValue: supplierRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
      ],
    }).compile();
    await module.init();

    service = module.get<ImportFormService>(ImportFormService);
  });

  describe('createImportForm', () => {
    beforeEach(() => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);
      importFormRepository.findOne.mockResolvedValue(null);
      supplierRepository.findOneBy.mockResolvedValue(supplier);
      userRepository.findOneBy.mockResolvedValue(requester);
    });

    it('creates a DRAFT with supplier/requester snapshots and an uppercased code', async () => {
      const result = await service.createImportForm('wh-slug', createDto, actor());

      expect(importFormRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'PN-0001',
          status: ImportFormStatus.Draft,
          supplier,
          supplierName: 'Supplier A',
          supplierCode: 'NCC-01',
          supplierSlug: 'sup-slug',
          supplierTaxCode: '0101234567',
          supplierAddress: 'Hanoi',
          requester,
          requesterName: 'Nguyen An',
          approver: null,
          approverName: null,
          warehouse,
        }),
      );
      expect(result).toMatchObject({
        code: 'PN-0001',
        status: ImportFormStatus.Draft,
        requesterSlug: 'u1-slug',
        approverSlug: null,
        warehouseSlug: 'wh-slug',
        total: 1000,
      });
      expect(result).not.toHaveProperty('id');
    });

    it('rejects an inactive warehouse', async () => {
      warehouseRepository.findOneBy.mockResolvedValue({ ...warehouse, isActive: false });

      await expectError(
        service.createImportForm('wh-slug', createDto, actor()),
        ImportFormValidation.IMPORT_FORM_WAREHOUSE_INACTIVE.code,
      );
      expect(importFormRepository.save).not.toHaveBeenCalled();
    });

    it('returns WAREHOUSE_NOT_FOUND for an unknown warehouse', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(null);

      await expectError(
        service.createImportForm('nope', createDto, actor()),
        WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      );
    });

    it('returns SUPPLIER_NOT_FOUND for an unknown supplier', async () => {
      supplierRepository.findOneBy.mockResolvedValue(null);

      await expectError(
        service.createImportForm('wh-slug', createDto, actor()),
        SupplierValidation.SUPPLIER_NOT_FOUND.code,
      );
    });

    it.each([
      ['an active form', undefined, ImportFormValidation.IMPORT_FORM_CODE_DOES_EXIST.code],
      [
        'a soft-deleted form',
        new Date(),
        ImportFormValidation.IMPORT_FORM_CODE_RESERVED_BY_DELETED_IMPORT_FORM.code,
      ],
    ])('rejects a code already held by %s', async (_label, deletedAt, code) => {
      importFormRepository.findOne.mockResolvedValue(draft({ deletedAt }));

      await expectError(service.createImportForm('wh-slug', createDto, actor()), code);
      expect(importFormRepository.findOne).toHaveBeenCalledWith({
        where: { code: 'PN-0001' },
        withDeleted: true,
      });
    });

    it('stores null (not undefined) when the supplier has no tax code/address', async () => {
      supplierRepository.findOneBy.mockResolvedValue({
        ...supplier,
        taxCode: undefined,
        address: undefined,
      });

      await service.createImportForm('wh-slug', createDto, actor());

      expect(importFormRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ supplierTaxCode: null, supplierAddress: null }),
      );
    });
  });

  describe('findAll / findOne', () => {
    it('scopes the list to the warehouse in the route and applies filters', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);
      importFormRepository.findAndCount.mockResolvedValue([[draft()], 1]);

      const result = await service.findAll('wh-slug', {
        page: 1,
        size: 10,
        status: ImportFormStatus.Draft,
        supplierSlug: 'sup-slug',
      });

      expect(importFormRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            warehouse: { slug: 'wh-slug' },
            status: ImportFormStatus.Draft,
            supplierSlug: 'sup-slug',
          },
        }),
      );
      expect(result).toMatchObject({ total: 1, items: [{ slug: 'form-slug' }] });
    });

    it('returns WAREHOUSE_NOT_FOUND instead of an empty list for an unknown warehouse', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(null);

      await expectError(
        service.findAll('nope', { page: 1, size: 10 }),
        WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      );
    });

    // Member của kho A không được đọc phiếu kho B qua URL của kho A.
    it('looks the form up by slug AND warehouse slug', async () => {
      importFormRepository.findOne.mockResolvedValue(null);

      await expectError(
        service.findOne('wh-a', 'form-of-b'),
        ImportFormValidation.IMPORT_FORM_NOT_FOUND.code,
      );
      expect(importFormRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: 'form-of-b', warehouse: { slug: 'wh-a' } } }),
      );
    });
  });

  describe('updateImportForm — partial (PATCH)', () => {
    const full = () => actor([AuthorityCode.ImportFormUpdateDraft]);

    it('loads the form with an optimistic lock on the sent version', async () => {
      importFormRepository.findOne.mockResolvedValue(draft());

      await service.updateImportForm('wh-slug', 'form-slug', { version: 3 }, full());

      expect(importFormRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ lock: { mode: 'optimistic', version: 3 } }),
      );
    });

    it('keeps fields that were not sent', async () => {
      importFormRepository.findOne.mockResolvedValue(draft());

      const result = await service.updateImportForm(
        'wh-slug',
        'form-slug',
        { note: 'new note', version: 1 },
        full(),
      );

      expect(result).toMatchObject({
        note: 'new note',
        code: 'PN-0001',
        invoiceCode: 'HD-1',
        total: 1000,
        supplierName: 'Supplier A',
      });
      expect(supplierRepository.findOneBy).not.toHaveBeenCalled();
    });

    // Automapper không kế thừa map Create -> Update: field nào thiếu `forMember` là PATCH âm thầm bỏ.
    it('applies every editable field that is sent', async () => {
      importFormRepository.findOne.mockResolvedValueOnce(draft()).mockResolvedValueOnce(null);
      const patch = {
        code: 'pn-0002',
        purchaseOrder: 'PO-9',
        invoiceCode: 'HD-9',
        date: '2026-11-01',
        total: 99.5,
        file: 'import-forms/x.pdf',
        note: 'n',
      };

      const result = await service.updateImportForm(
        'wh-slug',
        'form-slug',
        { ...patch, version: 1 },
        full(),
      );

      expect(result).toMatchObject({ ...patch, code: 'PN-0002' });
    });

    it('re-snapshots the supplier only when supplierSlug is sent', async () => {
      importFormRepository.findOne.mockResolvedValue(
        draft({ supplierTaxCode: 'OLD-TAX', supplierAddress: 'Old address' }),
      );
      supplierRepository.findOneBy.mockResolvedValue({
        id: 'sup-2',
        slug: 'sup-2-slug',
        code: 'NCC-02',
        name: 'Supplier B',
      });

      await service.updateImportForm(
        'wh-slug',
        'form-slug',
        { supplierSlug: 'sup-2-slug', version: 1 },
        full(),
      );

      expect(importFormRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierSlug: 'sup-2-slug',
          supplierName: 'Supplier B',
          supplierCode: 'NCC-02',
          supplierTaxCode: null,
          supplierAddress: null,
        }),
      );
    });

    it('checks code uniqueness only when the code actually changes', async () => {
      importFormRepository.findOne.mockResolvedValueOnce(draft());

      await service.updateImportForm(
        'wh-slug',
        'form-slug',
        { code: 'pn-0001', version: 1 },
        full(),
      );

      expect(importFormRepository.findOne).toHaveBeenCalledTimes(1);
    });

    it.each([ImportFormStatus.Confirmed, ImportFormStatus.Cancelled])(
      'rejects a %s form',
      async (status) => {
        importFormRepository.findOne.mockResolvedValue(draft({ status }));

        await expectError(
          service.updateImportForm('wh-slug', 'form-slug', { version: 1 }, full()),
          ImportFormValidation.IMPORT_FORM_NOT_DRAFT.code,
        );
        expect(importFormRepository.save).not.toHaveBeenCalled();
      },
    );

    it('lets _OWN edit a form they requested', async () => {
      importFormRepository.findOne.mockResolvedValue(draft());

      await expect(
        service.updateImportForm(
          'wh-slug',
          'form-slug',
          { version: 1 },
          actor([AuthorityCode.ImportFormUpdateDraftOwn], 'u1'),
        ),
      ).resolves.toBeDefined();
    });

    it("rejects _OWN on someone else's form", async () => {
      importFormRepository.findOne.mockResolvedValue(draft());

      await expectError(
        service.updateImportForm(
          'wh-slug',
          'form-slug',
          { version: 1 },
          actor([AuthorityCode.ImportFormUpdateDraftOwn], 'someone-else'),
        ),
        ImportFormValidation.IMPORT_FORM_NOT_OWNER.code,
      );
    });

    it('returns 403 when the user has neither the full nor the _OWN authority', async () => {
      importFormRepository.findOne.mockResolvedValue(draft());

      await expect(
        service.updateImportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u1')),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets SUPER_ADMIN through without any authority in scope', async () => {
      importFormRepository.findOne.mockResolvedValue(draft());

      await expect(
        service.updateImportForm(
          'wh-slug',
          'form-slug',
          { version: 1 },
          actor([], 'root', RoleEnum.SuperAdmin),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('deleteImportForm', () => {
    it('soft-deletes a DRAFT form', async () => {
      const form = draft();
      importFormRepository.findOne.mockResolvedValue(form);

      await expect(
        service.deleteImportForm(
          'wh-slug',
          'form-slug',
          actor([AuthorityCode.ImportFormDeleteDraft]),
        ),
      ).resolves.toBe(1);
      expect(importFormRepository.softRemove).toHaveBeenCalledWith(form);
    });

    it('rejects a CONFIRMED form', async () => {
      importFormRepository.findOne.mockResolvedValue(draft({ status: ImportFormStatus.Confirmed }));

      await expectError(
        service.deleteImportForm(
          'wh-slug',
          'form-slug',
          actor([AuthorityCode.ImportFormDeleteDraft]),
        ),
        ImportFormValidation.IMPORT_FORM_NOT_DRAFT.code,
      );
      expect(importFormRepository.softRemove).not.toHaveBeenCalled();
    });

    // Quyền sửa không kéo theo quyền xoá: check đúng cặp code DELETE.
    it('does not accept UPDATE authorities for delete', async () => {
      importFormRepository.findOne.mockResolvedValue(draft());

      await expect(
        service.deleteImportForm(
          'wh-slug',
          'form-slug',
          actor([AuthorityCode.ImportFormUpdateDraft, AuthorityCode.ImportFormUpdateDraftOwn]),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("rejects _OWN on someone else's form", async () => {
      importFormRepository.findOne.mockResolvedValue(draft());

      await expectError(
        service.deleteImportForm(
          'wh-slug',
          'form-slug',
          actor([AuthorityCode.ImportFormDeleteDraftOwn], 'someone-else'),
        ),
        ImportFormValidation.IMPORT_FORM_NOT_OWNER.code,
      );
    });
  });

  describe('confirm / cancel', () => {
    beforeEach(() => userRepository.findOneBy.mockResolvedValue(approver));

    it.each([
      ['confirmImportForm', ImportFormStatus.Confirmed],
      ['cancelImportForm', ImportFormStatus.Cancelled],
    ] as const)('%s moves DRAFT to %s and records the approver', async (method, status) => {
      importFormRepository.findOne.mockResolvedValue(draft());

      const result = await service[method]('wh-slug', 'form-slug', { version: 2 }, actor([], 'u2'));

      expect(importFormRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ lock: { mode: 'optimistic', version: 2 } }),
      );
      expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: 'u2' });
      expect(result).toMatchObject({
        status,
        approverSlug: 'u2-slug',
        approverName: 'Tran Binh',
      });
    });

    it.each([ImportFormStatus.Confirmed, ImportFormStatus.Cancelled])(
      'cannot confirm a %s form again',
      async (status) => {
        importFormRepository.findOne.mockResolvedValue(draft({ status }));

        await expectError(
          service.confirmImportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
          ImportFormValidation.IMPORT_FORM_NOT_DRAFT.code,
        );
        expect(importFormRepository.save).not.toHaveBeenCalled();
      },
    );

    it('throws ImportFormException when the form does not exist', async () => {
      importFormRepository.findOne.mockResolvedValue(null);

      await expect(
        service.cancelImportForm('wh-slug', 'nope', { version: 1 }, actor()),
      ).rejects.toBeInstanceOf(ImportFormException);
    });
  });
});
