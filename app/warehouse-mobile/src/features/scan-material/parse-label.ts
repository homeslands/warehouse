/** Nhãn đã phân tích: Mã vật tư nội bộ + serial (VIẾT HOA) nếu nhãn có dạng `<MÃ>*<SERIAL>`. */
export type ParsedLabel = { code: string; serial: string | null }

/**
 * Đọc nhãn quét được. Nhãn mới `<MÃ VẬT TƯ>*<SERIAL>` tách tại `*` ĐẦU TIÊN (hai phần đều trim, serial
 * viết hoa); thiếu một trong hai phần → coi như chỉ có Mã (`code` = phần trước `*`). Nhãn cũ (không
 * `*`) → cả chuỗi là Mã. Mã giữ nguyên hoa thường (so khớp không phân biệt ở `matchCode`).
 */
export function parseLabel(text: string): ParsedLabel {
  const t = text.trim()
  const star = t.indexOf('*')
  if (star < 0) return { code: t, serial: null }
  const code = t.slice(0, star).trim()
  const serial = t
    .slice(star + 1)
    .trim()
    .toUpperCase()
  return { code, serial: code !== '' && serial !== '' ? serial : null }
}
