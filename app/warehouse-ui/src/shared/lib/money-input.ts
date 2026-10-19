import i18n from '@/shared/i18n'

/** Dấu nhóm nghìn / dấu thập phân của ô tiền theo ngôn ngữ: vi `1.500.000,5`, en `1,500,000.5`. */
export type MoneySeparators = { group: '.' | ','; decimal: '.' | ',' }

export function moneySeparators(language = i18n.resolvedLanguage): MoneySeparators {
  return language === 'en' ? { group: ',', decimal: '.' } : { group: '.', decimal: ',' }
}

/** 15 chữ số phần nguyên — quá nữa thì `Number` mất chính xác (backend chặn từ 1e12 qua schema). */
const MAX_INTEGER_DIGITS = 15

type Parsed = { int: string; frac: string; hasDecimal: boolean }

/**
 * Đoán dấu nào là thập phân trong chuỗi gõ / dán (chỉ xét `.` và `,`):
 * - dấu xuất hiện từ hai lần trở lên là dấu nhóm (`1,500,000` dán vào ô tiếng Việt vẫn là một triệu rưỡi);
 * - có cả hai loại → dấu đứng sau cùng là thập phân (`1.500,5` / `1,500.5`);
 * - chỉ một dấu, một lần → theo ngôn ngữ (vi: `1.500` = 1500, `1,5` = 1,5).
 */
function decimalCharOf(raw: string, sep: MoneySeparators): string | null {
  const dots = raw.split('.').length - 1
  const commas = raw.split(',').length - 1
  if (dots > 0 && commas > 0) {
    const last = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','))
    const char = raw[last]
    return (char === '.' ? dots : commas) === 1 ? char : null
  }
  if (dots === 1) return sep.decimal === '.' ? '.' : null
  if (commas === 1) return sep.decimal === ',' ? ',' : null
  return null
}

function parse(raw: string, sep: MoneySeparators, maxFractionDigits: number): Parsed {
  const cleaned = raw.replace(/[^\d.,]/g, '')
  const dec = maxFractionDigits > 0 ? decimalCharOf(cleaned, sep) : null
  const at = dec === null ? -1 : cleaned.lastIndexOf(dec)
  const intPart = (at < 0 ? cleaned : cleaned.slice(0, at)).replace(/\D/g, '')
  const fracPart = at < 0 ? '' : cleaned.slice(at + 1).replace(/\D/g, '')
  return {
    int: intPart.replace(/^0+(?=\d)/, '').slice(0, MAX_INTEGER_DIGITS),
    frac: fracPart.slice(0, maxFractionDigits),
    hasDecimal: at >= 0,
  }
}

function group(int: string, sep: MoneySeparators): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, sep.group)
}

function render({ int, frac, hasDecimal }: Parsed, sep: MoneySeparators): string {
  if (int === '' && !hasDecimal) return ''
  const head = group(int === '' ? '0' : int, sep)
  return hasDecimal ? `${head}${sep.decimal}${frac}` : head
}

/**
 * Chuỗi đang gõ / vừa dán → chuỗi hiển thị chuẩn: nhóm nghìn, đúng dấu thập phân của ngôn ngữ, tối đa
 * `maxFractionDigits` số lẻ, bỏ ký tự lạ và số 0 thừa ở đầu. Giữ dấu thập phân cuối chuỗi khi đang gõ (`1.500,`).
 */
export function normalizeMoneyText(
  raw: string,
  sep: MoneySeparators,
  maxFractionDigits = 2,
): string {
  return render(parse(raw, sep, maxFractionDigits), sep)
}

/** Chuỗi hiển thị (đã chuẩn hoá) → số. Rỗng → `undefined`; không bao giờ trả `NaN`. */
export function moneyTextToNumber(text: string, sep: MoneySeparators): number | undefined {
  if (text.trim() === '') return undefined
  const n = Number(text.split(sep.group).join('').replace(sep.decimal, '.'))
  return Number.isFinite(n) ? n : undefined
}

/** Số → chuỗi hiển thị chuẩn (không có dấu thập phân treo). */
export function formatMoneyText(
  value: number | undefined,
  sep: MoneySeparators,
  maxFractionDigits = 2,
): string {
  if (value === undefined || !Number.isFinite(value)) return ''
  const fixed = Math.abs(value).toFixed(maxFractionDigits)
  const [int, frac = ''] = fixed.split('.')
  const trimmed = frac.replace(/0+$/, '')
  return render({ int, frac: trimmed, hasDecimal: trimmed !== '' }, sep)
}

/**
 * Vị trí con trỏ sau khi chuẩn hoá: giữ nguyên số chữ số (và dấu thập phân) đứng trước con trỏ, để gõ / xoá giữa
 * chuỗi không làm con trỏ nhảy về cuối khi dấu nhóm được thêm / bớt.
 */
export function caretAfterNormalize(
  raw: string,
  caret: number,
  formatted: string,
  sep: MoneySeparators,
  maxFractionDigits = 2,
): number {
  const before = raw.slice(0, caret)
  const dec = maxFractionDigits > 0 ? decimalCharOf(raw.replace(/[^\d.,]/g, ''), sep) : null
  const decAt = dec === null ? -1 : raw.lastIndexOf(dec)
  const decBefore = decAt >= 0 && decAt < caret
  // Số 0 thừa ở đầu bị bỏ → trừ ra khỏi số chữ số đứng trước con trỏ.
  const leadingZeros = /^0+(?=\d)/.exec(raw.replace(/[^\d]/g, ''))?.[0].length ?? 0
  let digits = Math.max(0, (before.match(/\d/g)?.length ?? 0) - leadingZeros)
  let pos = 0
  let seenDecimal = false
  while (pos < formatted.length) {
    if (digits === 0 && (!decBefore || seenDecimal)) break
    const char = formatted[pos]
    if (/\d/.test(char)) digits = Math.max(0, digits - 1)
    else if (char === sep.decimal) seenDecimal = true
    pos += 1
  }
  return pos
}
