import { ean13CheckDigit, isValidEan13 } from './ean13.util';

describe('ean13.util', () => {
  it.each([
    ['400638133393', '1'],
    ['590123412345', '7'],
    ['000000000000', '0'],
    ['200010000001', '4'],
  ])('check digit of %s is %s', (digits12, check) => {
    expect(ean13CheckDigit(digits12)).toBe(check);
  });

  it('refuses input that is not exactly 12 digits', () => {
    expect(() => ean13CheckDigit('12345')).toThrow();
    expect(() => ean13CheckDigit('20001000000A')).toThrow();
  });

  it('validates full EAN-13 codes', () => {
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('5901234123457')).toBe(true);
    expect(isValidEan13('4006381333932')).toBe(false);
    expect(isValidEan13('400638133393')).toBe(false);
    expect(isValidEan13('400638133393A')).toBe(false);
  });
});
