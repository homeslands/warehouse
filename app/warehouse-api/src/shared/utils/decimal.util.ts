/** Số chữ số thập phân của cột tiền DECIMAL(18,2). */
export const MONEY_SCALE = 2;

/** Trần (loại trừ) của DECIMAL(18,2): 16 chữ số phần nguyên. Kiểm trước khi ghi. */
export const MONEY_MAX = 1e16;

/** Trần (loại trừ) của DECIMAL(18,6): 12 chữ số phần nguyên. Kiểm trước khi ghi. */
export const QUANTITY_MAX = 1e12;

/**
 * Làm tròn tiền về 2 chữ số — `toFixed` như `roundToScale` (`decimal.transformer.ts`), không nhân
 * chia trên số dấu phẩy động.
 */
export const roundMoney = (value: number): number => Number(value.toFixed(MONEY_SCALE));
