import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ChangeImportFormStatusRequestDto,
  AddImportFormItemRequestDto,
  CreateImportFormRequestDto,
  GetAllImportFormRequestDto,
  GetImportFormAvailableMaterialRequestDto,
  UpdateImportFormRequestDto,
} from './import-form.dto';

const messagesOf = <T extends object>(cls: new () => T, payload: object, property?: string) =>
  validateSync(plainToInstance(cls, payload), { whitelist: true })
    .filter((e) => !property || e.property === property)
    .flatMap((e) => Object.values(e.constraints ?? {}));

describe('CreateImportFormRequestDto', () => {
  const valid = {
    invoiceCode: 'HD-1',
    date: '2026-10-12',
  };

  it('accepts a minimal valid body (purchaseOrder/file/note optional)', () => {
    expect(messagesOf(CreateImportFormRequestDto, valid)).toEqual([]);
  });

  // Mã phiếu do server tự sinh (`CodeGenerateService`) — client gửi `code` thì bị `whitelist` bỏ.
  it('strips code from the body', () => {
    const dto = plainToInstance(CreateImportFormRequestDto, { ...valid, code: 'PN-2026-0001' });
    expect(validateSync(dto, { whitelist: true })).toEqual([]);
    expect(dto).not.toHaveProperty('code');
  });

  // Phiếu nhập không gắn nhà cung cấp — `supplierSlug` không còn là field của body.
  it('strips supplierSlug from the body', () => {
    const dto = plainToInstance(CreateImportFormRequestDto, { ...valid, supplierSlug: 'sup' });
    validateSync(dto, { whitelist: true });
    expect(dto).not.toHaveProperty('supplierSlug');
  });

  it.each([
    ['invoiceCode', 'IMPORT_FORM_INVOICE_CODE_IS_REQUIRED'],
    ['date', 'IMPORT_FORM_DATE_INVALID'],
  ])('requires %s', (field, message) => {
    const body: Record<string, unknown> = { ...valid };
    delete body[field];
    expect(messagesOf(CreateImportFormRequestDto, body, field)).toContain(message);
  });

  it.each(['12/10/2026', '2026-13-01', '2026-02-30', '2026-10-12T00:00:00Z'])(
    'rejects date %s',
    (date) => {
      expect(messagesOf(CreateImportFormRequestDto, { ...valid, date }, 'date')).toContain(
        'IMPORT_FORM_DATE_INVALID',
      );
    },
  );

  // Phiếu tạo rỗng — dòng thêm qua `POST .../items`, `items` gửi kèm bị `whitelist` cắt.
  it('strips items from the body', () => {
    const dto = plainToInstance(CreateImportFormRequestDto, {
      ...valid,
      items: [{ materialSlug: 'mat-1', quantity: 1, unitPrice: 1 }],
    });
    expect(validateSync(dto, { whitelist: true })).toEqual([]);
    expect(dto).not.toHaveProperty('items');
  });

  // `total` do server tính từ các dòng — client gửi kèm bị `whitelist` cắt.
  it('strips total from the body', () => {
    const dto = plainToInstance(CreateImportFormRequestDto, { ...valid, total: 1 });
    validateSync(dto, { whitelist: true });
    expect(dto).not.toHaveProperty('total');
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

describe('AddImportFormItemRequestDto', () => {
  const valid = { materialSlug: 'mat-1', unitSlug: 'unit-1', quantity: 10, unitPrice: 1500.5 };

  it('accepts a valid manual entry (note optional)', () => {
    expect(messagesOf(AddImportFormItemRequestDto, valid)).toEqual([]);
  });

  // Quét: chỉ barcode + đơn giá, đơn vị mặc định = đơn vị cơ sở, quantity mặc định 1.
  it('accepts a scan (barcode only) and defaults quantity to 1', () => {
    const body = { barcode: '2000100000019', unitPrice: 0 };
    const dto = plainToInstance(AddImportFormItemRequestDto, body);

    expect(messagesOf(AddImportFormItemRequestDto, body)).toEqual([]);
    expect(dto.quantity).toBe(1);
  });

  it('requires unitPrice', () => {
    expect(
      messagesOf(AddImportFormItemRequestDto, { materialSlug: 'mat-1' }, 'unitPrice'),
    ).toContain('IMPORT_FORM_ITEM_UNIT_PRICE_INVALID');
  });

  it.each([
    ['0', 0],
    ['negative', -1],
    ['not an integer', 1.5],
    ['above 500', 501],
    ['a string', '10'],
  ])('rejects quantity %s', (_label, quantity) => {
    expect(messagesOf(AddImportFormItemRequestDto, { ...valid, quantity }, 'quantity')).toContain(
      'IMPORT_FORM_ITEM_QUANTITY_INVALID',
    );
  });

  it.each(['123', 'abc12345', '123456789012345'])('rejects barcode %s', (barcode) => {
    expect(messagesOf(AddImportFormItemRequestDto, { barcode, unitPrice: 1 }, 'barcode')).toContain(
      'IMPORT_FORM_ITEM_BARCODE_INVALID',
    );
  });

  it.each([
    ['materialSlug', 'IMPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED'],
    ['unitSlug', 'IMPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED'],
  ])('rejects an empty %s', (field, message) => {
    expect(messagesOf(AddImportFormItemRequestDto, { ...valid, [field]: '  ' }, field)).toContain(
      message,
    );
  });

  it.each([
    ['negative', -1],
    ['more than 2 decimals', 1.234],
  ])('rejects unitPrice %s', (_label, unitPrice) => {
    expect(messagesOf(AddImportFormItemRequestDto, { ...valid, unitPrice }, 'unitPrice')).toContain(
      'IMPORT_FORM_ITEM_UNIT_PRICE_INVALID',
    );
  });

  it('accepts unitPrice = 0', () => {
    expect(
      messagesOf(AddImportFormItemRequestDto, { ...valid, unitPrice: 0 }, 'unitPrice'),
    ).toEqual([]);
  });
});

describe('UpdateImportFormRequestDto — PATCH partial', () => {
  it('accepts a body with only version', () => {
    expect(messagesOf(UpdateImportFormRequestDto, { version: 1 })).toEqual([]);
  });

  it('still validates a field when it is sent', () => {
    expect(messagesOf(UpdateImportFormRequestDto, { version: 1, date: 'x' }, 'date')).toContain(
      'IMPORT_FORM_DATE_INVALID',
    );
  });

  // Dòng không sửa qua PATCH — `items` gửi kèm bị `whitelist` cắt.
  it('strips items from the body', () => {
    const dto = plainToInstance(UpdateImportFormRequestDto, { version: 1, items: [] });
    validateSync(dto, { whitelist: true });
    expect(dto).not.toHaveProperty('items');
  });
});

// `version: 0` là falsy ⇒ TypeORM bỏ qua optimistic lock — phải bị chặn ở DTO.
describe.each([
  ['UpdateImportFormRequestDto', UpdateImportFormRequestDto],
  ['ChangeImportFormStatusRequestDto', ChangeImportFormStatusRequestDto],
])('%s.version', (_name, cls) => {
  // Mọi validator của `version` dùng chung 1 key ⇒ `message[0]` mà `HttpExceptionFilter` tra luôn là
  // `IMPORT_FORM_VERSION_INVALID` (422 + code), bất kể ràng buộc nào fail trước.
  it.each([
    ['missing', undefined],
    ['null', null],
    ['0', 0],
    ['negative', -1],
    ['not an integer', 1.5],
    ['a string', 'abc'],
  ])('rejects version %s with IMPORT_FORM_VERSION_INVALID', (_label, version) => {
    const messages = messagesOf(cls as new () => object, { version }, 'version');
    expect(messages).not.toEqual([]);
    expect(new Set(messages)).toEqual(new Set(['IMPORT_FORM_VERSION_INVALID']));
  });

  it('accepts version 1', () => {
    expect(messagesOf(cls as new () => object, { version: 1 }, 'version')).toEqual([]);
  });
});

describe.each([
  ['GetAllImportFormRequestDto', GetAllImportFormRequestDto],
  ['GetImportFormAvailableMaterialRequestDto', GetImportFormAvailableMaterialRequestDto],
])('%s.code', (_, cls: new () => { code?: string }) => {
  it('upper-cases and trims the code', () => {
    const dto = plainToInstance(cls, { code: '  pn-2026_a ' });

    expect(dto.code).toBe('PN-2026_A');
    expect(messagesOf(cls, { code: '  pn-2026_a ' }, 'code')).toEqual([]);
  });

  it.each(['PN%', 'PN 01', 'PN@1'])('rejects %s', (code) => {
    expect(messagesOf(cls, { code }, 'code')).toContain('IMPORT_FORM_CODE_SEARCH_INVALID');
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

describe('AddImportFormItemRequestDto.expiryDate', () => {
  const line = { materialSlug: 'mat-1', unitSlug: 'unit-1', quantity: 1, unitPrice: 1 };

  it('is optional', () => {
    expect(messagesOf(AddImportFormItemRequestDto, line)).toEqual([]);
  });

  it('accepts YYYY-MM-DD', () => {
    expect(messagesOf(AddImportFormItemRequestDto, { ...line, expiryDate: '2027-02-28' })).toEqual(
      [],
    );
  });

  it.each(['2027-02-30', '28/02/2027', '2027-02-28T00:00:00Z'])('rejects %s', (expiryDate) => {
    expect(
      messagesOf(AddImportFormItemRequestDto, { ...line, expiryDate }, 'expiryDate'),
    ).toContain('IMPORT_FORM_ITEM_EXPIRY_DATE_INVALID');
  });
});
