import { EXPORT_FORM_MONEY_SCALE } from 'src/export-form/export-form.constants';
import { IMPORT_FORM_MONEY_SCALE } from 'src/import-form/import-form.constants';
import { MONEY_SCALE as SUPPLIER_MONEY_SCALE } from 'src/supplier/supplier.constants';
import { MONEY_MAX, MONEY_SCALE, QUANTITY_MAX, roundMoney } from './decimal.util';

describe('decimal.util', () => {
  it('keeps the DECIMAL(18,2) / DECIMAL(18,6) ceilings used by import/export forms', () => {
    expect(MONEY_MAX).toBe(1e16);
    expect(QUANTITY_MAX).toBe(1e12);
  });

  it('uses the same money scale as the DTO validators of supplier/import/export', () => {
    expect(MONEY_SCALE).toBe(2);
    expect(SUPPLIER_MONEY_SCALE).toBe(MONEY_SCALE);
    expect(IMPORT_FORM_MONEY_SCALE).toBe(MONEY_SCALE);
    expect(EXPORT_FORM_MONEY_SCALE).toBe(MONEY_SCALE);
  });

  describe('roundMoney', () => {
    it.each([0, 1, 0.1 + 0.2, 1.005, 2.675, 10.125, 1234.5678, -3.335, 99999999.999, 1e15 + 0.25])(
      'matches the legacy `Number(value.toFixed(2))` for %p',
      (value) => {
        expect(roundMoney(value)).toBe(Number(value.toFixed(2)));
      },
    );

    it('removes floating point noise', () => {
      expect(roundMoney(0.1 + 0.2)).toBe(0.3);
      expect(roundMoney(3 * 1.1)).toBe(3.3);
    });
  });
});
