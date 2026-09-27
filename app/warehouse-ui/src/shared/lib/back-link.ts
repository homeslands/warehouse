/**
 * Đích của nút "Quay lại danh sách" trên trang chi tiết. Link trong bảng gửi kèm
 * `state.backTo = pathname + search` của danh sách, để quay về đúng trang/bộ lọc người dùng vừa rời.
 * Mở thẳng link chi tiết (không có state) → về danh sách gốc. Chỉ nhận đường dẫn thuộc chính danh
 * sách `base` — `state` đến từ lịch sử trình duyệt, không tin mù.
 */
export function readBackTo(state: unknown, base: string): string {
  if (typeof state === 'object' && state !== null && 'backTo' in state) {
    const value = (state as { backTo: unknown }).backTo
    if (typeof value === 'string' && (value === base || value.startsWith(`${base}?`))) return value
  }
  return base
}
