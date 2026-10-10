/**
 * Bỏ dấu tiếng Việt + chữ thường để so khớp khi lọc tại client: gõ "da nang" vẫn ra "Đà Nẵng". Dùng chung cho
 * `Combobox` và các danh sách chọn tự lọc (vd hộp gắn vật tư cho nhà cung cấp).
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

/** `text` có chứa `query` không (cả hai đã bỏ dấu). Chuỗi tìm rỗng khớp mọi thứ. */
export function matchesSearch(text: string, query: string): boolean {
  return normalizeSearchText(text).includes(normalizeSearchText(query))
}
