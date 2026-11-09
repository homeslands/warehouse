/** Chỉ giữ chữ số — chuỗi gửi lên server. */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '')
}

// Ký tự người ta hay dùng khi viết số điện thoại; có ký tự khác (chữ) thì đó không phải số.
const PHONE_PUNCTUATION = /^[\d\s+\-().]*$/
const GROUPS = [4, 3, 3] as const

/**
 * Định dạng để HIỂN THỊ: số VN 10 chữ số nhóm 4-3-3 ("0912 345 678"), nhóm dần khi đang gõ.
 * Dài hơn 10 chữ số hoặc có chữ (vd tài khoản `root`) thì giữ nguyên như người dùng viết.
 */
export function formatPhone(raw: string): string {
  const trimmed = raw.trim()
  if (!PHONE_PUNCTUATION.test(trimmed)) return trimmed
  const digits = digitsOnly(trimmed)
  if (digits.length > 10) return trimmed

  const parts: string[] = []
  let start = 0
  for (const size of GROUPS) {
    const part = digits.slice(start, start + size)
    if (part) parts.push(part)
    start += size
  }
  return parts.join(' ')
}

/**
 * Chữ số để gửi lên server, đổi số quốc tế VN về dạng nội địa: iOS tự điền từ danh bạ hay ra
 * "+84 912 345 678" → `84912345678`, server chỉ biết `0912345678`. Chỉ đổi khi đủ 84/0084 + 9 chữ
 * số, nên đang gõ dở không bị đổi.
 */
export function normalizeVnPhone(raw: string): string {
  const digits = digitsOnly(raw)
  const international = /^(?:0084|84)(\d{9})$/.exec(digits)
  return international ? `0${international[1]}` : digits
}
