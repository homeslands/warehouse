import type { InventoryItem, ThresholdPatch } from '@/entities/inventory'
import { can, type CurrentUser } from '@/entities/session'
import { parseDecimalInput } from '@/shared/lib/format'

/**
 * Một ô ngưỡng. `default` = theo mặc định vật tư; `shown` là số mặc định khi biết (chỉ khi trường
 * riêng đang `null` lúc điền — lúc đó `effective*` chính là mặc định), còn bấm "Dùng mặc định" trên
 * ô đang đặt riêng thì không biết số → không có `shown`.
 */
export type ThresholdField = { mode: 'default'; shown?: number } | { mode: 'custom'; text: string }

export type ThresholdForm = { min: ThresholdField; max: ThresholdField }

export type ThresholdErrors = {
  min?: 'required' | 'invalid'
  max?: 'required' | 'invalid'
  range?: true
}

/** Cần CẢ HAI quyền (BE: `@RequireAuthority(MATERIAL_UPDATE, WAREHOUSE_UPDATE)` là AND). */
export function canEditThresholds(user: CurrentUser | null): boolean {
  return can(user, 'MATERIAL_UPDATE') && can(user, 'WAREHOUSE_UPDATE')
}

const fieldOf = (own: number | null, effective: number): ThresholdField =>
  own === null ? { mode: 'default', shown: effective } : { mode: 'custom', text: String(own) }

export function initialThresholdForm(item: InventoryItem): ThresholdForm {
  return {
    min: fieldOf(item.minimumInventory, item.effectiveMinimumInventory),
    max: fieldOf(item.maximumInventory, item.effectiveMaximumInventory),
  }
}

/** Số của ô custom: `undefined` = trống, `null` = sai, số = hợp lệ. */
function parseField(text: string): number | null | undefined {
  if (text.trim() === '') return undefined
  return parseDecimalInput(text)
}

/** Số đang áp cho ô, hoặc `undefined` nếu chưa biết / chưa hợp lệ. */
function valueOf(f: ThresholdField): number | undefined {
  if (f.mode === 'default') return f.shown
  return parseField(f.text) ?? undefined
}

export function validateThresholdForm(form: ThresholdForm): ThresholdErrors {
  const errors: ThresholdErrors = {}
  for (const key of ['min', 'max'] as const) {
    const f = form[key]
    if (f.mode !== 'custom') continue
    const v = parseField(f.text)
    if (v === undefined) errors[key] = 'required'
    else if (v === null) errors[key] = 'invalid'
  }
  if (errors.min || errors.max) return errors
  const min = valueOf(form.min)
  const max = valueOf(form.max)
  if (min !== undefined && max !== undefined && max < min) errors.range = true
  return errors
}

function fieldPatch(initial: ThresholdField, now: ThresholdField): number | null | undefined {
  if (now.mode === 'default') return initial.mode === 'default' ? undefined : null
  const v = parseField(now.text)
  if (v === undefined || v === null) return undefined
  if (initial.mode === 'custom' && parseField(initial.text) === v) return undefined
  return v
}

/** Chỉ các trường đã đổi so với lúc điền (BE không có version, người lưu sau thắng). `{}` = không đổi. */
export function thresholdPatch(initial: ThresholdForm, form: ThresholdForm): ThresholdPatch {
  const patch: ThresholdPatch = {}
  const min = fieldPatch(initial.min, form.min)
  const max = fieldPatch(initial.max, form.max)
  if (min !== undefined) patch.minimumInventory = min
  if (max !== undefined) patch.maximumInventory = max
  return patch
}
