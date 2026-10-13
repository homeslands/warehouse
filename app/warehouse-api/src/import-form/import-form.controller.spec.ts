import { Test, TestingModule } from '@nestjs/testing';
import { ImportFormController } from './import-form.controller';
import { ImportFormService } from './import-form.service';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { WAREHOUSE_SCOPE_KEY } from 'src/warehouse/decorator/warehouse-scope.decorator';

describe('ImportFormController', () => {
  let controller: ImportFormController;
  const importFormService = {
    createImportForm: jest.fn(),
    findAll: jest.fn(),
    findAvailableMaterials: jest.fn(),
    findOne: jest.fn(),
    updateImportForm: jest.fn(),
    deleteImportForm: jest.fn(),
    confirmImportForm: jest.fn(),
    cancelImportForm: jest.fn(),
  };
  const actor = { userId: 'user-id-1', scope: [] };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImportFormController],
      providers: [{ provide: ImportFormService, useValue: importFormService }],
    }).compile();

    controller = module.get<ImportFormController>(ImportFormController);
  });

  it('passes warehouseSlug then slug through to the service, in that order', async () => {
    importFormService.confirmImportForm.mockResolvedValue({ slug: 'form-slug' });

    const response = await controller.confirmImportForm(
      'wh-slug',
      'form-slug',
      { version: 1 },
      actor,
    );

    expect(importFormService.confirmImportForm).toHaveBeenCalledWith(
      'wh-slug',
      'form-slug',
      { version: 1 },
      actor,
    );
    expect(response.statusCode).toBe(200);
  });

  it('renders the delete count as a message string', async () => {
    importFormService.deleteImportForm.mockResolvedValue(1);

    const response = await controller.deleteImportForm('wh-slug', 'form-slug', actor);

    expect(response.result).toBe('1 import form have been deleted successfully');
  });

  it('scopes every route to the warehouse in :warehouseSlug', () => {
    expect(Reflect.getMetadata(WAREHOUSE_SCOPE_KEY, ImportFormController)).toBe('warehouseSlug');
  });

  describe('@RequireAuthority metadata', () => {
    const authorityOf = (handler: keyof ImportFormController) =>
      Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, ImportFormController.prototype[handler]);

    it.each([
      ['createImportForm', [AuthorityCode.ImportFormCreate]],
      ['findAll', [AuthorityCode.ImportFormRead]],
      ['findAvailableMaterials', [AuthorityCode.ImportFormCreate]],
      ['findOne', [AuthorityCode.ImportFormRead]],
      ['confirmImportForm', [AuthorityCode.ImportFormConfirm]],
      ['cancelImportForm', [AuthorityCode.ImportFormConfirm]],
    ] as const)('%s requires %j', (handler, codes) => {
      expect(authorityOf(handler)).toEqual(codes);
    });

    // Full-or-_OWN là OR, decorator chỉ biểu diễn AND ⇒ check nằm ở service. Gắn decorator vào đây
    // sẽ chặn mất người chỉ có quyền `_OWN`.
    it.each(['updateImportForm', 'deleteImportForm'] as const)(
      '%s has no guard-level authority (checked in the service)',
      (handler) => {
        expect(authorityOf(handler)).toBeUndefined();
      },
    );
  });
});
