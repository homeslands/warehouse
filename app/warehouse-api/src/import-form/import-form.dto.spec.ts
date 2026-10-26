import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ChangeImportFormStatusRequestDto,
  CreateImportFormItemDto,
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
    code: 'PN-2026-0001',
    invoiceCode: 'HD-1',
    date: '2026-10-12',
    items: [{ materialSlug: 'mat-1', unitSlug: 'unit-1', quantity: 10, unitPrice: 1500.5 }],
  };

  it('accepts a minimal valid body (purchaseOrder/file/note optional)', () => {
    expect(messagesOf(CreateImportFormRequestDto, valid)).toEqual([]);
  });

  // Phiếu nhập không gắn nhà cung cấp — `supplierSlug` không còn là field của body.
  it('strips supplierSlug from the body', () => {
    const dto = plainToInstance(CreateImportFormRequestDto, { ...valid, supplierSlug: 'sup' });
    validateSync(dto, { whitelist: true });
    expect(dto).not.toHaveProperty('supplierSlug');
  });

  it.each([
    ['code', 'IMPORT_FORM_CODE_IS_REQUIRED'],
    ['invoiceCode', 'IMPORT_FORM_INVOICE_CODE_IS_REQUIRED'],
    ['date', 'IMPORT_FORM_DATE_INVALID'],
    ['items', 'IMPORT_FORM_ITEMS_IS_REQUIRED'],
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

  it('rejects an empty items array', () => {
    expect(messagesOf(CreateImportFormRequestDto, { ...valid, items: [] }, 'items')).toContain(
      'IMPORT_FORM_ITEMS_IS_REQUIRED',
    );
  });

  it('rejects more than 200 items', () => {
    const items = Array.from({ length: 201 }, (_, i) => ({
      ...valid.items[0],
      unitSlug: `u-${i}`,
    }));
    expect(messagesOf(CreateImportFormRequestDto, { ...valid, items }, 'items')).toContain(
      'IMPORT_FORM_ITEMS_TOO_MANY',
    );
  });

  // `@ValidateNested` + `@Type`: lỗi của dòng nằm trong `children`, không phải `constraints` của `items`.
  it('validates each item and turns it into a CreateImportFormItemDto', () => {
    const dto = plainToInstance(CreateImportFormRequestDto, {
      ...valid,
      items: [{ ...valid.items[0], quantity: 0 }],
    });
    const [error] = validateSync(dto, { whitelist: true });

    expect(dto.items[0]).toBeInstanceOf(CreateImportFormItemDto);
    expect(error.property).toBe('items');
    expect(Object.values(error.children?.[0].children?.[0].constraints ?? {})).toContain(
      'IMPORT_FORM_ITEM_QUANTITY_INVALID',
    );
  });

  // `total` do server tính từ `items` — client gửi kèm bị `whitelist` cắt.
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

describe('CreateImportFormItemDto', () => {
  const valid = { materialSlug: 'mat-1', unitSlug: 'unit-1', quantity: 10, unitPrice: 1500.5 };

  it('accepts a valid item (note optional)', () => {
    expect(messagesOf(CreateImportFormItemDto, valid)).toEqual([]);
  });

  it.each([
    ['materialSlug', 'IMPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED'],
    ['unitSlug', 'IMPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED'],
    ['quantity', 'IMPORT_FORM_ITEM_QUANTITY_INVALID'],
    ['unitPrice', 'IMPORT_FORM_ITEM_UNIT_PRICE_INVALID'],
  ])('requires %s', (field, message) => {
    const body: Record<string, unknown> = { ...valid };
    delete body[field];
    expect(messagesOf(CreateImportFormItemDto, body, field)).toContain(message);
  });

  it.each([
    ['0', 0],
    ['negative', -1],
    ['more than 6 decimals', 0.0000001],
    ['a string', '10'],
  ])('rejects quantity %s', (_label, quantity) => {
    expect(messagesOf(CreateImportFormItemDto, { ...valid, quantity }, 'quantity')).toContain(
      'IMPORT_FORM_ITEM_QUANTITY_INVALID',
    );
  });

  it.each([
    ['negative', -1],
    ['more than 2 decimals', 1.234],
  ])('rejects unitPrice %s', (_label, unitPrice) => {
    expect(messagesOf(CreateImportFormItemDto, { ...valid, unitPrice }, 'unitPrice')).toContain(
      'IMPORT_FORM_ITEM_UNIT_PRICE_INVALID',
    );
  });

  it('accepts unitPrice = 0', () => {
    expect(messagesOf(CreateImportFormItemDto, { ...valid, unitPrice: 0 }, 'unitPrice')).toEqual(
      [],
    );
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

  // Gửi `items` là thay toàn bộ dòng ⇒ không được thay bằng mảng rỗng.
  it('rejects items: [] when items is sent', () => {
    expect(messagesOf(UpdateImportFormRequestDto, { version: 1, items: [] }, 'items')).toContain(
      'IMPORT_FORM_ITEMS_IS_REQUIRED',
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

describe('CreateImportFormItemDto.expiryDate', () => {
  const line = { materialSlug: 'mat-1', unitSlug: 'unit-1', quantity: 1, unitPrice: 1 };

  it('is optional', () => {
    expect(messagesOf(CreateImportFormItemDto, line)).toEqual([]);
  });

  it('accepts YYYY-MM-DD', () => {
    expect(messagesOf(CreateImportFormItemDto, { ...line, expiryDate: '2027-02-28' })).toEqual([]);
  });

  it.each(['2027-02-30', '28/02/2027', '2027-02-28T00:00:00Z'])('rejects %s', (expiryDate) => {
    expect(messagesOf(CreateImportFormItemDto, { ...line, expiryDate }, 'expiryDate')).toContain(
      'IMPORT_FORM_ITEM_EXPIRY_DATE_INVALID',
    );
  });
});
