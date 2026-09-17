export function isEmptyObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Object.keys(value).length === 0;
}

/**
 * Giữ lại các key thực sự được client gửi lên — dùng cho PATCH (partial update).
 *
 * Field vắng mặt (`undefined`) hoặc `null` đều mang nghĩa "không đổi" ⇒ phải giữ nguyên giá trị cũ
 * trong DB. Không lọc thì `Object.assign(entity, data)` dán `undefined` đè lên entity: TypeORM bỏ
 * qua `undefined` lúc `save()` nên DB không hỏng, nhưng entity trả về đã mất giá trị ⇒ response
 * thiếu field. Còn `null` thì tệ hơn — nó được ghi thật và làm MySQL ném lỗi ở cột NOT NULL.
 */
export function pickDefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null),
  ) as Partial<T>;
}
