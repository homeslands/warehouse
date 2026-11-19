export type FormatLocale = 'vi' | 'en'

const intlLocale = (locale: FormatLocale) => (locale === 'vi' ? 'vi-VN' : 'en-US')

/** Mặc định 3 chữ số lẻ (danh sách); nơi cần đúng từng số (hộp xác nhận ghi phiếu) truyền 6. */
export function formatQuantity(
  value: number,
  locale: FormatLocale,
  maximumFractionDigits = 3,
): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits }).format(value)
}

/** Tiền VND: số nguyên ngăn nghìn theo locale + " đ" ở cuối (chuẩn chung của app, cả vi lẫn en). */
export function formatMoney(value: number, locale: FormatLocale): string {
  const n = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value)
  return `${n} đ`
}

const COMPACT_UNITS = {
  vi: [
    { min: 1e9, suffix: 'tỷ' },
    { min: 1e6, suffix: 'tr' },
    { min: 1e3, suffix: 'N' },
  ],
  en: [
    { min: 1e9, suffix: 'B' },
    { min: 1e6, suffix: 'M' },
    { min: 1e3, suffix: 'K' },
  ],
} as const

/** < 10 giữ 2 số lẻ (1,25), còn lại 1 số lẻ (125,4); số lẻ 0 bị bỏ khi hiển thị. */
const roundCompact = (v: number) => {
  const f = v < 10 ? 100 : 10
  return Math.round(v * f) / f
}

/**
 * Tiền rút gọn cho số lớn trên thẻ: 1,25 / 12,5 / 125,4 (tối đa 2 số lẻ khi < 10, 1 số lẻ khi lớn hơn) + đơn vị (vi `N`/`tr`/`tỷ`, en `K`/`M`/`B`)
 * + " đ". Làm tròn TRƯỚC khi chọn đơn vị (999.999 → "1 tr đ"). Dưới 1 triệu = `formatMoney` đầy đủ.
 */
export function formatMoneyCompact(value: number, locale: FormatLocale): string {
  const units = COMPACT_UNITS[locale]
  const abs = Math.abs(value)
  if (!(abs >= 1e6)) return formatMoney(value, locale)
  let i = units.findIndex((u) => abs >= u.min)
  let scaled = roundCompact(abs / units[i].min)
  if (scaled >= 1000 && i > 0) {
    i -= 1
    scaled = roundCompact(abs / units[i].min)
  }
  const n = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }).format(
    value < 0 ? -scaled : scaled,
  )
  return `${n}${locale === 'vi' ? ' ' : ''}${units[i].suffix} đ`
}

/** Chuỗi chỉ có ngày (`yyyy-MM-dd`) hiểu theo giờ máy, không lệch múi giờ như `new Date(str)`. */
export function parseLocalDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value)
}

const two = (n: number) => String(n).padStart(2, '0')

/** Ngày ngắn `dd/MM/yy` (ngày nhập, hạn dùng của lô). Không đọc được thì trả nguyên văn. */
export function formatShortDate(value: string): string {
  const d = parseLocalDate(value)
  if (Number.isNaN(d.getTime())) return value
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${two(d.getFullYear() % 100)}`
}

/** Ngày đầy đủ `dd/MM/yyyy` (đầu phiếu nhập), cùng thứ tự cho vi lẫn en như `formatShortDate`. */
export function formatFullDate(value: string): string {
  const d = parseLocalDate(value)
  if (Number.isNaN(d.getTime())) return value
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${String(d.getFullYear()).padStart(4, '0')}`
}

/** Ngày nhập `dd/MM`, thêm `/yyyy` khi khác năm của `now`; không đọc được → `null`. */
export function formatEntryDate(value: string, now: Date): string | null {
  const d = parseLocalDate(value)
  if (Number.isNaN(d.getTime())) return null
  const base = `${two(d.getDate())}/${two(d.getMonth() + 1)}`
  return d.getFullYear() === now.getFullYear() ? base : `${base}/${d.getFullYear()}`
}

/** Giờ:phút `HH:mm` theo giờ máy của một mốc thời gian ISO. Không đọc được thì trả chuỗi rỗng. */
export function formatTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${two(d.getHours())}:${two(d.getMinutes())}`
}

/** Ngày-tháng `dd/MM` theo giờ máy của một mốc thời gian ISO (dòng danh sách gom theo tháng). Không đọc được → rỗng. */
export function formatDayMonth(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${two(d.getDate())}/${two(d.getMonth() + 1)}`
}

/** Ngày (`YYYY-MM-DD`) theo giờ máy của một mốc thời gian ISO; không đọc được → `null`. */
export function localDayKey(iso: string): string | null {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : todayLocalIso(d)
}

/** Ngày hôm nay theo giờ máy, `YYYY-MM-DD`. */
export function todayLocalIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`
}

/**
 * Đọc số thập phân người dùng gõ: dấu `,` hoặc `.` đều là dấu thập phân, bỏ khoảng trắng.
 * Rỗng, không hợp lệ, âm hoặc quá `maxScale` chữ số lẻ → `null`.
 */
export function parseDecimalInput(text: string, maxScale = 6): number | null {
  const s = text.replace(/\s+/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$|^\.\d+$|^\d+\.$/.test(s)) return null
  const scale = s.split('.')[1]?.length ?? 0
  if (scale > maxScale) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
