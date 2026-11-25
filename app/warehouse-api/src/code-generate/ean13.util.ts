/**
 * Chữ số kiểm tra EAN-13 (GS1 mod 10): nhân trọng số 1/3 xen kẽ tính từ TRÁI qua 12 chữ số đầu,
 * chữ số kiểm tra = (10 - tổng mod 10) mod 10.
 */
export const ean13CheckDigit = (digits12: string): string => {
  if (!/^\d{12}$/.test(digits12)) throw new Error(`EAN-13 needs 12 digits, got "${digits12}"`);
  const sum = [...digits12].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
};

export const isValidEan13 = (code: string): boolean =>
  /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === code[12];
