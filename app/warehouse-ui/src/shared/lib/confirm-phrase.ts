/**
 * Chữ người dùng gõ có khớp chữ cần gõ để xác nhận không (pattern "type to confirm"). Bỏ khoảng trắng hai
 * đầu — dán từ nơi khác hay dư một dấu cách không nên chặn — nhưng giữ phân biệt hoa/thường và dấu.
 */
export function isPhraseConfirmed(typed: string, phrase: string): boolean {
  return typed.trim() === phrase
}
