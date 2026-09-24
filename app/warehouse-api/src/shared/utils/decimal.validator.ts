import { registerDecorator, ValidationOptions } from 'class-validator';

/** Số thập phân dạng thường (không mũ). Dấu âm được chấp nhận — giới hạn dưới do `@Min`/
 * `@IsPositive` lo, decorator này chỉ xét SỐ CHỮ SỐ THẬP PHÂN. */
const PLAIN_DECIMAL_REGEX = /^-?\d+(\.\d+)?$/;

/**
 * Chặn số có quá `scale` chữ số thập phân so với cột DECIMAL tương ứng dưới DB.
 *
 * KHÔNG dùng `@IsNumber({ maxDecimalPlaces })` của class-validator: nó làm
 * `value.toString().split('.')[1].length`, mà `(0.0000001).toString()` ra `'1e-7'` (không có dấu
 * chấm) ⇒ `undefined.length` ⇒ **TypeError ném ra giữa pipe, thành lỗi 500** thay vì 422. Số dạng
 * mũ vừa là đầu vào hợp lệ của JSON vừa luôn nằm ngoài tầm DECIMAL(18,6), nên ở đây coi là không
 * hợp lệ luôn.
 */
export function IsDecimalWithScale(scale: number, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDecimalWithScale',
      target: object.constructor,
      propertyName,
      constraints: [scale],
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'number' || !Number.isFinite(value)) return false;
          const raw = String(value);
          if (!PLAIN_DECIMAL_REGEX.test(raw)) return false;
          return (raw.split('.')[1] ?? '').length <= scale;
        },
      },
    });
  };
}
