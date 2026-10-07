import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateSupplierTransactionRequestDto, UpdateSupplierRequestDto } from './supplier.dto';
import { SupplierTransactionType } from './supplier.constants';

const messages = <T extends object>(cls: new () => T, payload: object): string[] =>
  validateSync(plainToInstance(cls, payload), { whitelist: true }).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );

describe('UpdateSupplierRequestDto — PATCH partial', () => {
  it('chấp nhận body rỗng (không đổi field nào)', () => {
    expect(messages(UpdateSupplierRequestDto, {})).toEqual([]);
  });

  it('chấp nhận body chỉ có address', () => {
    expect(messages(UpdateSupplierRequestDto, { address: 'Địa chỉ mới' })).toEqual([]);
  });

  it('vẫn validate field CÓ gửi', () => {
    expect(messages(UpdateSupplierRequestDto, { code: '-bad-' })).toContain(
      'SUPPLIER_CODE_INVALID',
    );
    expect(messages(UpdateSupplierRequestDto, { email: 'not-an-email' })).toContain(
      'SUPPLIER_EMAIL_INVALID',
    );
  });
});

describe('CreateSupplierTransactionRequestDto', () => {
  const purchase = {
    type: SupplierTransactionType.Purchase,
    materialSlug: 'm1',
    quantity: 2,
    unitPrice: 1500.5,
  };

  it('chấp nhận PURCHASE đủ vật tư/số lượng/đơn giá', () => {
    expect(messages(CreateSupplierTransactionRequestDto, purchase)).toEqual([]);
  });

  it.each(['materialSlug', 'quantity', 'unitPrice'])('PURCHASE thiếu %s bị chặn', (field) => {
    const payload: Record<string, unknown> = { ...purchase };
    delete payload[field];
    expect(messages(CreateSupplierTransactionRequestDto, payload)).not.toEqual([]);
  });

  it('chặn số lượng <= 0 và quá 6 chữ số thập phân', () => {
    expect(messages(CreateSupplierTransactionRequestDto, { ...purchase, quantity: 0 })).toContain(
      'SUPPLIER_TRANSACTION_QUANTITY_INVALID',
    );
    expect(
      messages(CreateSupplierTransactionRequestDto, { ...purchase, quantity: 0.0000001 }),
    ).toContain('SUPPLIER_TRANSACTION_QUANTITY_INVALID');
  });

  it('chặn đơn giá quá 2 chữ số thập phân', () => {
    expect(
      messages(CreateSupplierTransactionRequestDto, { ...purchase, unitPrice: 1.005 }),
    ).toContain('SUPPLIER_TRANSACTION_UNIT_PRICE_INVALID');
  });

  it('PAYMENT chỉ cần amount dương', () => {
    const payment = { type: SupplierTransactionType.Payment };
    expect(messages(CreateSupplierTransactionRequestDto, { ...payment, amount: 500000 })).toEqual(
      [],
    );
    expect(messages(CreateSupplierTransactionRequestDto, { ...payment, amount: 0 })).toContain(
      'SUPPLIER_TRANSACTION_AMOUNT_INVALID',
    );
    expect(messages(CreateSupplierTransactionRequestDto, payment)).toContain(
      'SUPPLIER_TRANSACTION_AMOUNT_INVALID',
    );
  });

  it('chặn type lạ và ngày sai định dạng', () => {
    expect(messages(CreateSupplierTransactionRequestDto, { ...purchase, type: 'GIFT' })).toContain(
      'SUPPLIER_TRANSACTION_TYPE_INVALID',
    );
    expect(
      messages(CreateSupplierTransactionRequestDto, { ...purchase, transactionDate: 'hôm qua' }),
    ).toContain('SUPPLIER_TRANSACTION_DATE_INVALID');
  });
});
