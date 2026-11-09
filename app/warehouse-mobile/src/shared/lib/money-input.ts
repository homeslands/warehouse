type Locale = 'vi' | 'en'

const seps = (locale: Locale) =>
  locale === 'vi' ? { group: '.', decimal: ',' } : { group: ',', decimal: '.' }

/**
 * Chữ người dùng vừa gõ → chữ đã ngăn nghìn (vi: nhóm ".", thập phân ","; en: ngược lại). Bỏ mọi ký tự
 * lạ, giữ dấu thập phân đang gõ dở ("12," → "12,"), cắt phần lẻ quá `maxDecimals`, bỏ số 0 đứng đầu.
 * CHỈ dấu thập phân của locale mở phần lẻ: dấu nhóm gõ vào (vi ".", en ",") luôn bị bỏ, kể cả gõ cuối —
 * người dùng vi gõ "1.250" theo thói quen phải được 1250, không bao giờ 1,25 (sai 1000 lần, âm thầm).
 */
export function formatMoneyInput(typed: string, locale: Locale, maxDecimals = 2): string {
  const { group, decimal } = seps(locale)
  let int = ''
  let frac = ''
  let hasDecimal = false
  for (const ch of typed) {
    if (ch >= '0' && ch <= '9') {
      if (hasDecimal) frac += ch
      else int += ch
    } else if (ch === decimal) {
      hasDecimal = true
    }
  }
  if (int !== '') int = int.replace(/^0+/, '') || '0'
  if (int === '' && hasDecimal) int = '0'
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, group)
  if (!hasDecimal || maxDecimals === 0) return grouped
  return `${grouped}${decimal}${frac.slice(0, maxDecimals)}`
}

/** Chữ trong ô tiền → số. Trống = `null`. Dấu nhóm của locale được bỏ. */
export function parseMoneyInput(
  text: string,
  locale: Locale,
  maxDecimals = 2,
): { value: number | null } | { error: 'invalid' | 'tooManyDecimals' | 'tooLarge' } {
  const { group, decimal } = seps(locale)
  const trimmed = text.trim()
  if (trimmed === '') return { value: null }
  const plain = trimmed.split(group).join('')
  const parts = plain.split(decimal)
  if (parts.length > 2 || !/^\d*$/.test(parts[0]) || !/^\d*$/.test(parts[1] ?? '')) {
    return { error: 'invalid' }
  }
  if (parts[0] === '' && (parts[1] ?? '') === '') return { error: 'invalid' }
  if ((parts[1] ?? '').length > maxDecimals) return { error: 'tooManyDecimals' }
  const n = Number(`${parts[0] || '0'}.${parts[1] || '0'}`)
  if (n >= 1e16) return { error: 'tooLarge' }
  return { value: n }
}
