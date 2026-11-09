import { formatQuantity, type FormatLocale } from './format'
import { round6 } from './round'

/** Đơn vị của vật tư; `conversionRate` = số đơn vị GỐC trong 1 đơn vị này (1 gói = 24 chai → 24). */
export type RateUnit = {
  unitSlug: string
  unitName: string
  conversionRate: number
  isBaseUnit: boolean
}

type T = (key: string, options?: Record<string, string>) => string

const known = (rate: number) => Number.isFinite(rate) && rate > 0
const fmt = (n: number, locale: FormatLocale) => formatQuantity(n, locale, 6)

export const baseOfUnits = <U extends RateUnit>(units: readonly U[]): U | undefined =>
  units.find((u) => u.isBaseUnit)

/** "24 chai" cho tuỳ chọn "gói (24 chai)" của action sheet; đơn vị gốc / chưa rõ tỉ lệ → `null`. */
export function unitOptionHint(
  unit: RateUnit,
  base: RateUnit | undefined,
  locale: FormatLocale,
): string | null {
  if (!base || unit.isBaseUnit || unit.unitSlug === base.unitSlug || !known(unit.conversionRate)) {
    return null
  }
  return `${fmt(unit.conversionRate, locale)} ${base.unitName}`
}

/**
 * Chú thích dưới nhóm "Số lượng": "1 gói = 24 chai · 600 gói = 14.400 chai". Chỉ khi đơn vị đang chọn
 * KHÔNG phải đơn vị gốc và tỉ lệ rõ; số lượng trống / 0 → chỉ vế đầu. Chữ lấy qua `t` (keys
 * `common:compose.unit.rate` / `.total`).
 */
export function unitConversionNote({
  units,
  unitSlug,
  quantity,
  locale,
  t,
}: {
  units: readonly RateUnit[]
  unitSlug: string
  quantity: number | null
  locale: FormatLocale
  t: T
}): string | null {
  const unit = units.find((u) => u.unitSlug === unitSlug)
  const base = baseOfUnits(units)
  if (!unit || !base || unit.isBaseUnit || unit.unitSlug === base.unitSlug) return null
  if (!known(unit.conversionRate)) return null
  const parts = [
    t('common:compose.unit.rate', {
      unit: unit.unitName,
      rate: fmt(unit.conversionRate, locale),
      base: base.unitName,
    }),
  ]
  if (quantity !== null && Number.isFinite(quantity) && quantity > 0) {
    parts.push(
      t('common:compose.unit.total', {
        qty: fmt(quantity, locale),
        unit: unit.unitName,
        value: fmt(round6(quantity * unit.conversionRate), locale),
        base: base.unitName,
      }),
    )
  }
  return parts.join(' · ')
}
