import { Test, TestingModule } from '@nestjs/testing';
import { ExportFormController } from './export-form.controller';
import { ExportFormService } from './export-form.service';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { WAREHOUSE_SCOPE_KEY } from 'src/warehouse/decorator/warehouse-scope.decorator';

describe('ExportFormController', () => {
  let controller: ExportFormController;
  const exportFormService = {
    createExportForm: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateExportForm: jest.fn(),
    deleteExportForm: jest.fn(),
    confirmExportForm: jest.fn(),
    cancelExportForm: jest.fn(),
    uploadFile: jest.fn(),
  };
  const actor = { userId: 'user-id-1', scope: [] };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExportFormController],
      providers: [{ provide: ExportFormService, useValue: exportFormService }],
    }).compile();
    controller = module.get(ExportFormController);
  });

  it('passes warehouseSlug then slug through to the service, in that order', async () => {
    exportFormService.confirmExportForm.mockResolvedValue({ slug: 'form-slug' });

    const response = await controller.confirmExportForm(
      'wh-slug',
      'form-slug',
      { version: 1 },
      actor,
    );

    expect(exportFormService.confirmExportForm).toHaveBeenCalledWith(
      'wh-slug',
      'form-slug',
      { version: 1 },
      actor,
    );
    expect(response.statusCode).toBe(200);
  });

  it('renders the delete count as a message string', async () => {
    exportFormService.deleteExportForm.mockResolvedValue(1);

    const response = await controller.deleteExportForm('wh-slug', 'form-slug', actor);

    expect(response.result).toBe('1 export form have been deleted successfully');
  });

  it('scopes every route to the warehouse in :warehouseSlug', () => {
    expect(Reflect.getMetadata(WAREHOUSE_SCOPE_KEY, ExportFormController)).toBe('warehouseSlug');
  });

  describe('@RequireAuthority metadata', () => {
    const authorityOf = (handler: keyof ExportFormController) =>
      Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, ExportFormController.prototype[handler]);

    it.each([
      ['createExportForm', [AuthorityCode.ExportFormCreate]],
      ['findAll', [AuthorityCode.ExportFormRead]],
      ['findOne', [AuthorityCode.ExportFormRead]],
      ['confirmExportForm', [AuthorityCode.ExportFormConfirm]],
      ['cancelExportForm', [AuthorityCode.ExportFormConfirm]],
    ] as const)('%s requires %j', (handler, codes) => {
      expect(authorityOf(handler)).toEqual(codes);
    });

    // Full-or-_OWN là OR ⇒ check ở service; `APPROVE_DISPOSAL` phụ thuộc `type` của phiếu ⇒ cũng ở service.
    it.each(['updateExportForm', 'deleteExportForm', 'uploadFile'] as const)(
      '%s has no guard-level authority (checked in the service)',
      (handler) => {
        expect(authorityOf(handler)).toBeUndefined();
      },
    );
  });
});
