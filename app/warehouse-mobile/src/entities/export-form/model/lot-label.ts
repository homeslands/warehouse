import { formatEntryDate, formatFullDate, type FormatLocale } from '@/shared/lib/format'

const WORDS: Record<FormatLocale, { exp: string; none: string; entry: string }> = {
  vi: { exp: 'HSD', none: 'Không HSD', entry: 'nhập' },
  en: { exp: 'Exp', none: 'No expiry', entry: 'received' },
}

/**
 * Nhãn của lô (thay cho mã lô, vốn không có nghĩa với người dùng): "HSD 12/03/2027 · nhập 05/10".
 * Lô không HSD → "Không HSD · nhập 05/10". Thiếu ngày nhập (chưa tải được lô) → chỉ phần HSD.
 */
export function formatLotLabel(
  lot: { expiryDate: string | null; entryDate?: string | null },
  now: Date,
  locale: FormatLocale,
): string {
  const w = WORDS[locale]
  const expiry = lot.expiryDate ? `${w.exp} ${formatFullDate(lot.expiryDate)}` : w.none
  const entry = lot.entryDate ? formatEntryDate(lot.entryDate, now) : null
  return entry ? `${expiry} · ${w.entry} ${entry}` : expiry
}
