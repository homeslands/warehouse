/** Chuẩn hoá để so khớp tìm kiếm: bỏ dấu tiếng Việt, `đ` → `d`, chữ thường, cắt khoảng trắng hai đầu. */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
}
