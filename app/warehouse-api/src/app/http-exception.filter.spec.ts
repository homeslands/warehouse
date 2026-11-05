import { ArgumentsHost, BadRequestException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { AppValidation } from './app.validation';
import {
  CreateImportFormRequestDto,
  GetAllImportFormRequestDto,
  UpdateImportFormRequestDto,
} from 'src/import-form/import-form.dto';
import { ChangeExportFormStatusRequestDto } from 'src/export-form/export-form.dto';
import { BaseQueryDto, MAX_PAGE_SIZE } from './base.dto';
import { AppException } from './app.exception';
import { AppCommonValidation } from './app-common.validation';
import { buildSortOrder } from 'src/shared/utils/query.util';

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  const run = (exception: BadRequestException) => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/test', method: 'POST' }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(exception, host);
    return { status, body: json.mock.calls[0][0] };
  };

  it('maps a top-level validation key to 422 + its code', () => {
    const { status, body } = run(
      new BadRequestException({ message: ['IMPORT_FORM_ITEMS_IS_REQUIRED'] }),
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body).toMatchObject({
      code: AppValidation.IMPORT_FORM_ITEMS_IS_REQUIRED.code,
      message: AppValidation.IMPORT_FORM_ITEMS_IS_REQUIRED.message,
    });
  });

  // `ValidationPipe` mặc định trả `items.0.KEY` cho DTO lồng nhau — filter phải bỏ tiền tố đường dẫn.
  it('maps a nested DTO error from the default ValidationPipe', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const body = {
      code: 'PN-1',
      invoiceCode: 'HD-1',
      date: '2026-10-12',
      items: [{ materialSlug: 'm', unitSlug: 'u', quantity: -1, unitPrice: 1 }],
    };

    const error = await pipe
      .transform(body, { type: 'body', metatype: CreateImportFormRequestDto })
      .catch((e: BadRequestException) => e);

    expect((error as BadRequestException).getResponse()).toMatchObject({
      message: ['items.0.IMPORT_FORM_ITEM_QUANTITY_INVALID'],
    });

    const { status, body: response } = run(error as BadRequestException);
    expect(status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(response).toMatchObject({
      code: AppValidation.IMPORT_FORM_ITEM_QUANTITY_INVALID.code,
      message: AppValidation.IMPORT_FORM_ITEM_QUANTITY_INVALID.message,
    });
  });

  // Issue #170: `page`/`size` (`BaseQueryDto`) và `version` (DTO phiếu `VersionedBase`) trước đây
  // không có message key ⇒ 400 không `code`. Nay đi qua `ValidationPipe` thật phải ra 422 + code.
  describe('page/size/version keys (issue #170)', () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const validate = (value: object, type: 'body' | 'query', metatype: new () => object) =>
      pipe.transform(value, { type, metatype }).catch((e: BadRequestException) => e);

    it.each([
      ['page=0', { page: '0' }, 'PAGE_INVALID'],
      ['page=abc', { page: 'abc' }, 'PAGE_INVALID'],
      ['size=-1', { size: '-1' }, 'SIZE_INVALID'],
      ['size=1.5', { size: '1.5' }, 'SIZE_INVALID'],
    ])('query %s → 422 + %s code', async (_label, query, key) => {
      const error = await validate(query, 'query', BaseQueryDto);

      const { status, body } = run(error as BadRequestException);
      expect(status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(body).toMatchObject({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        code: AppValidation[key].code,
        message: AppValidation[key].message,
      });
    });

    it.each([
      ['UpdateImportFormRequestDto version=0', UpdateImportFormRequestDto, { version: 0 }],
      ['UpdateImportFormRequestDto version missing', UpdateImportFormRequestDto, {}],
      ['UpdateImportFormRequestDto version=1.5', UpdateImportFormRequestDto, { version: 1.5 }],
    ])('%s → 422 + IMPORT_FORM_VERSION_INVALID', async (_label, metatype, payload) => {
      const error = await validate(payload, 'body', metatype);

      const { status, body } = run(error as BadRequestException);
      expect(status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(body).toMatchObject({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        code: AppValidation.IMPORT_FORM_VERSION_INVALID.code,
      });
    });

    it('ChangeExportFormStatusRequestDto version=0 → 422 + EXPORT_FORM_VERSION_INVALID', async () => {
      const error = await validate({ version: 0 }, 'body', ChangeExportFormStatusRequestDto);

      const { status, body } = run(error as BadRequestException);
      expect(status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(body).toMatchObject({ code: AppValidation.EXPORT_FORM_VERSION_INVALID.code });
    });
  });

  // Issue #179: 4 key date/sort trước đây 400 — nay 422 như page/size, giữ nguyên code + message.
  // Thay đổi có chủ đích của hợp đồng lỗi (FE tra theo `code`).
  describe('date/sort keys and size cap (issue #179)', () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const validateQuery = (query: object, metatype: new () => object = BaseQueryDto) =>
      pipe.transform(query, { type: 'query', metatype }).catch((e: BadRequestException) => e);

    it.each([
      ['startDate=bad', { startDate: 'bad' }, BaseQueryDto, 'START_DATE_INVALID', 100850],
      ['endDate=2026-13-40', { endDate: '2026-13-40' }, BaseQueryDto, 'END_DATE_INVALID', 100851],
      ['sort=up', { sort: 'up' }, BaseQueryDto, 'SORT_INVALID', 100852],
      ['sortBy=dob', { sortBy: 'dob' }, GetAllImportFormRequestDto, 'SORT_BY_INVALID', 100853],
      ['size=501', { size: '501' }, BaseQueryDto, 'SIZE_INVALID', 100855],
    ])('query %s → 422 + %s (%d)', async (_label, query, metatype, key, code) => {
      const error = await validateQuery(query, metatype);
      expect(error).toBeInstanceOf(BadRequestException);

      const { status, body } = run(error as BadRequestException);
      expect(status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(body).toMatchObject({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        code,
        message: AppValidation[key].message,
      });
    });

    // Nhiều field cùng sai: status không còn phụ thuộc thứ tự khai báo field.
    it('mixed invalid fields (startDate=bad&page=0) → 422', async () => {
      const error = await validateQuery({ startDate: 'bad', page: '0' });

      const { status } = run(error as BadRequestException);
      expect(status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it.each([
      ['500', 500],
      ['1', 1],
    ])('query size=%s passes', async (size, expected) => {
      const dto = await pipe.transform({ size }, { type: 'query', metatype: BaseQueryDto });
      expect(dto).toMatchObject({ size: expected });
    });

    it('MAX_PAGE_SIZE is 500', () => {
      expect(MAX_PAGE_SIZE).toBe(500);
    });

    // `buildSortOrder` tự ném `SORT_BY_INVALID` (rào phòng thủ ở service) ⇒ cũng 422.
    it('SORT_BY_INVALID thrown by buildSortOrder → 422 + 100853', () => {
      let error: unknown;
      try {
        buildSortOrder<{ id: string; createdAt: Date }, string>({ sortBy: 'dob' }, {});
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(AppException);

      const { status, body } = run(error as BadRequestException);
      expect(status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(body).toMatchObject({
        code: AppCommonValidation.SORT_BY_INVALID.code,
        message: AppCommonValidation.SORT_BY_INVALID.message,
      });
    });
  });

  it('keeps unknown messages raw with the original status', () => {
    const { status, body } = run(new BadRequestException({ message: ['items.0.something odd'] }));

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(body).toMatchObject({ code: undefined, message: 'items.0.something odd' });
  });
});
