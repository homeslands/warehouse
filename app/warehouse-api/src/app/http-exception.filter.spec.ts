import { ArgumentsHost, BadRequestException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { AppValidation } from './app.validation';
import {
  CreateImportFormRequestDto,
  UpdateImportFormRequestDto,
} from 'src/import-form/import-form.dto';
import { ChangeExportFormStatusRequestDto } from 'src/export-form/export-form.dto';
import { BaseQueryDto } from './base.dto';

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

  it('keeps unknown messages raw with the original status', () => {
    const { status, body } = run(new BadRequestException({ message: ['items.0.something odd'] }));

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(body).toMatchObject({ code: undefined, message: 'items.0.something odd' });
  });
});
