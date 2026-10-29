import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ChangeExportFormStatusRequestDto,
  CreateExportFormRequestDto,
  GetAllExportFormRequestDto,
  UpdateExportFormRequestDto,
} from './export-form.dto';

const messagesOf = <T extends object>(cls: new () => T, payload: object, property?: string) =>
  validateSync(plainToInstance(cls, payload), { whitelist: true })
    .filter((e) => !property || e.property === property)
    .flatMap((e) => [
      ...Object.values(e.constraints ?? {}),
      ...(e.children ?? []).flatMap((c) =>
        (c.children ?? []).flatMap((cc) => Object.values(cc.constraints ?? {})),
      ),
    ]);

describe('CreateExportFormRequestDto', () => {
  const valid = {
    code: 'PX-2026-0001',
    type: 'SALE',
    purchaseOrder: 'PO-1',
    receiver: 'Xuong A',
    items: [{ materialSlug: 'mat-1', unitSlug: 'unit-1', quantity: 10, unitPrice: 1500.5 }],
  };

  it('accepts a minimal valid body (invoiceCode/file/note/batchSlug optional)', () => {
    expect(messagesOf(CreateExportFormRequestDto, valid)).toEqual([]);
  });

  it.each([
    ['code', 'EXPORT_FORM_CODE_IS_REQUIRED'],
    ['type', 'EXPORT_FORM_TYPE_INVALID'],
    ['purchaseOrder', 'EXPORT_FORM_PURCHASE_ORDER_IS_REQUIRED'],
    ['receiver', 'EXPORT_FORM_RECEIVER_IS_REQUIRED'],
    ['items', 'EXPORT_FORM_ITEMS_IS_REQUIRED'],
  ])('requires %s', (field, message) => {
    const body: Record<string, unknown> = { ...valid };
    delete body[field];
    expect(messagesOf(CreateExportFormRequestDto, body, field)).toContain(message);
  });

  it.each(['DRAFT', 'sale', 'GIFT'])('rejects type %s', (type) => {
    expect(messagesOf(CreateExportFormRequestDto, { ...valid, type }, 'type')).toContain(
      'EXPORT_FORM_TYPE_INVALID',
    );
  });

  it('strips status/totalAmount sent by the client', () => {
    const dto = plainToInstance(CreateExportFormRequestDto, {
      ...valid,
      status: 'CONFIRMED',
      totalAmount: 1,
    });
    validateSync(dto, { whitelist: true });
    expect(dto).not.toHaveProperty('status');
    expect(dto).not.toHaveProperty('totalAmount');
  });

  it('rejects an empty batchSlug', () => {
    const items = [{ ...valid.items[0], batchSlug: '  ' }];
    expect(messagesOf(CreateExportFormRequestDto, { ...valid, items }, 'items')).toContain(
      'EXPORT_FORM_ITEM_BATCH_SLUG_INVALID',
    );
  });
});

describe('UpdateExportFormRequestDto', () => {
  it('accepts a body with only version (every other field optional)', () => {
    expect(messagesOf(UpdateExportFormRequestDto, { version: 1 })).toEqual([]);
  });

  // `version: 0` là falsy ⇒ TypeORM bỏ qua check optimistic lock (xem CLAUDE.md).
  it.each([0, -1, undefined])('rejects version %s', (version) => {
    expect(messagesOf(UpdateExportFormRequestDto, { version }, 'version')).not.toEqual([]);
  });
});

describe('ChangeExportFormStatusRequestDto', () => {
  it.each([0, undefined])('rejects version %s', (version) => {
    expect(messagesOf(ChangeExportFormStatusRequestDto, { version }, 'version')).not.toEqual([]);
  });
});

describe('GetAllExportFormRequestDto', () => {
  it('rejects an unknown type / status', () => {
    expect(messagesOf(GetAllExportFormRequestDto, { type: 'X' }, 'type')).toContain(
      'EXPORT_FORM_TYPE_INVALID',
    );
    expect(messagesOf(GetAllExportFormRequestDto, { status: 'X' }, 'status')).toContain(
      'EXPORT_FORM_STATUS_INVALID',
    );
  });
});
