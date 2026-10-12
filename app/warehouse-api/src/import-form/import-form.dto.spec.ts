import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ChangeImportFormStatusRequestDto,
  CreateImportFormRequestDto,
  GetAllImportFormRequestDto,
  UpdateImportFormRequestDto,
} from './import-form.dto';

const messagesOf = <T extends object>(cls: new () => T, payload: object, property?: string) =>
  validateSync(plainToInstance(cls, payload), { whitelist: true })
    .filter((e) => !property || e.property === property)
    .flatMap((e) => Object.values(e.constraints ?? {}));

describe('CreateImportFormRequestDto', () => {
  const valid = {
    code: 'PN-2026-0001',
    invoiceCode: 'HD-1',
    supplierSlug: 'sup-slug',
    date: '2026-10-12',
    total: 1500000.5,
  };

  it('accepts a minimal valid body (purchaseOrder/file/note optional)', () => {
    expect(messagesOf(CreateImportFormRequestDto, valid)).toEqual([]);
  });

  it.each([
    ['code', 'IMPORT_FORM_CODE_IS_REQUIRED'],
    ['invoiceCode', 'IMPORT_FORM_INVOICE_CODE_IS_REQUIRED'],
    ['supplierSlug', 'IMPORT_FORM_SUPPLIER_SLUG_IS_REQUIRED'],
    ['date', 'IMPORT_FORM_DATE_INVALID'],
    ['total', 'IMPORT_FORM_TOTAL_INVALID'],
  ])('requires %s', (field, message) => {
    const body: Record<string, unknown> = { ...valid };
    delete body[field];
    expect(messagesOf(CreateImportFormRequestDto, body, field)).toContain(message);
  });

  it.each(['-PN', 'P', 'PN 01', 'a'.repeat(33)])('rejects code %s', (code) => {
    expect(messagesOf(CreateImportFormRequestDto, { ...valid, code }, 'code')).toContain(
      'IMPORT_FORM_CODE_INVALID',
    );
  });

  it.each(['12/10/2026', '2026-13-01', '2026-02-30', '2026-10-12T00:00:00Z'])(
    'rejects date %s',
    (date) => {
      expect(messagesOf(CreateImportFormRequestDto, { ...valid, date }, 'date')).toContain(
        'IMPORT_FORM_DATE_INVALID',
      );
    },
  );

  it.each([
    ['negative', -1],
    ['more than 2 decimals', 1.234],
    ['exponent form', 1e-7],
    ['a string', '100'],
  ])('rejects total that is %s', (_label, total) => {
    expect(messagesOf(CreateImportFormRequestDto, { ...valid, total }, 'total')).toContain(
      'IMPORT_FORM_TOTAL_INVALID',
    );
  });

  it('accepts total = 0', () => {
    expect(messagesOf(CreateImportFormRequestDto, { ...valid, total: 0 }, 'total')).toEqual([]);
  });

  it('rejects an over-long purchaseOrder', () => {
    expect(
      messagesOf(
        CreateImportFormRequestDto,
        { ...valid, purchaseOrder: 'x'.repeat(65) },
        'purchaseOrder',
      ),
    ).toContain('IMPORT_FORM_PURCHASE_ORDER_INVALID');
  });

  // Người lập/duyệt/trạng thái/kho do server quyết định — client gửi kèm cũng bị `whitelist` cắt.
  it('strips status/requester/approver/warehouse from the body', () => {
    const dto = plainToInstance(CreateImportFormRequestDto, {
      ...valid,
      status: 'CONFIRMED',
      requesterSlug: 'x',
      approverSlug: 'y',
      warehouseSlug: 'z',
    });
    validateSync(dto, { whitelist: true });
    expect(dto).not.toHaveProperty('status');
    expect(dto).not.toHaveProperty('approverSlug');
  });
});

describe('UpdateImportFormRequestDto — PATCH partial', () => {
  it('accepts a body with only version', () => {
    expect(messagesOf(UpdateImportFormRequestDto, { version: 1 })).toEqual([]);
  });

  it('still validates a field when it is sent', () => {
    expect(messagesOf(UpdateImportFormRequestDto, { version: 1, total: -1 }, 'total')).toContain(
      'IMPORT_FORM_TOTAL_INVALID',
    );
  });
});

// `version: 0` là falsy ⇒ TypeORM bỏ qua optimistic lock — phải bị chặn ở DTO.
describe.each([
  ['UpdateImportFormRequestDto', UpdateImportFormRequestDto],
  ['ChangeImportFormStatusRequestDto', ChangeImportFormStatusRequestDto],
])('%s.version', (_name, cls) => {
  it.each([
    ['missing', undefined],
    ['0', 0],
    ['negative', -1],
    ['not an integer', 1.5],
  ])('rejects version %s', (_label, version) => {
    expect(messagesOf(cls as new () => object, { version }, 'version')).not.toEqual([]);
  });

  it('accepts version 1', () => {
    expect(messagesOf(cls as new () => object, { version: 1 }, 'version')).toEqual([]);
  });
});

describe('GetAllImportFormRequestDto.status', () => {
  it('accepts a known status', () => {
    expect(messagesOf(GetAllImportFormRequestDto, { status: 'DRAFT' }, 'status')).toEqual([]);
  });

  it('rejects an unknown status', () => {
    expect(messagesOf(GetAllImportFormRequestDto, { status: 'DONE' }, 'status')).toContain(
      'IMPORT_FORM_STATUS_INVALID',
    );
  });
});
