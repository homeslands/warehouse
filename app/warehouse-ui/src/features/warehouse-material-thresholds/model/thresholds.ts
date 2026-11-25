import { z } from 'zod'
import { DECIMAL_18_6_LIMIT, hasAtMostDecimals } from '@/shared/lib/number'
import {
  INVENTORY_MAXIMUM_INVALID,
  INVENTORY_MINIMUM_INVALID,
  INVENTORY_RANGE_INVALID,
  type InventoryItem,
  type InventoryThresholdPatch,
} from '@/entities/inventory'

export type ThresholdDraft = {
  minimumInventory?: number
  maximumInventory?: number
}

export type ThresholdKey = keyof ThresholdDraft

export type ThresholdTarget = Pick<
  InventoryItem,
  | 'materialSlug'
  | 'materialCode'
  | 'materialName'
  | 'minimumInventory'
  | 'maximumInventory'
  | 'effectiveMinimumInventory'
  | 'effectiveMaximumInventory'
  | 'baseUnit'
>

export type ThresholdEditErrorKey =
  | 'inventory:thresholdInvalid'
  | 'inventory:thresholdTooLarge'
  | 'inventory:thresholdRange'
  | 'inventory:thresholdMinAboveDefaultMax'

export type ThresholdEditErrors = Partial<
  Record<ThresholdKey, { key: ThresholdEditErrorKey; values?: Record<string, number> }>
>

export type MaterialThresholdDefaults = {
  minimumInventory?: number
  maximumInventory?: number
}

const thresholdSchema = z
  .number({ error: 'inventory:thresholdInvalid' })
  .refine((v) => v >= 0 && hasAtMostDecimals(v, 6), 'inventory:thresholdInvalid')
  .refine((v) => v < DECIMAL_18_6_LIMIT, 'inventory:thresholdTooLarge')
  .optional()

export function initialThresholdDraft(item: ThresholdTarget): ThresholdDraft {
  return {
    minimumInventory: item.minimumInventory ?? undefined,
    maximumInventory: item.maximumInventory ?? undefined,
  }
}

/** Chỉ gửi các trường thay đổi so với giá trị gốc; bỏ override trở thành `null`. */
export function buildThresholdPatch(
  draft: ThresholdDraft,
  item: ThresholdTarget,
): InventoryThresholdPatch {
  const patch: InventoryThresholdPatch = {}
  const nextMin = draft.minimumInventory ?? null
  const nextMax = draft.maximumInventory ?? null
  if (nextMin !== item.minimumInventory) patch.minimumInventory = nextMin
  if (nextMax !== item.maximumInventory) patch.maximumInventory = nextMax
  return patch
}

export function validateThresholdDraft(
  draft: ThresholdDraft,
  item: ThresholdTarget,
  defaults?: MaterialThresholdDefaults,
): ThresholdEditErrors {
  const errors: ThresholdEditErrors = {}
  for (const key of ['minimumInventory', 'maximumInventory'] as const) {
    const result = thresholdSchema.safeParse(draft[key])
    if (!result.success) {
      errors[key] = { key: result.error.issues[0].message as ThresholdEditErrorKey }
    }
  }
  if (errors.minimumInventory || errors.maximumInventory) return errors

  // Khi đang giữ mặc định từ đầu (`item.* === null`), `effective*` chính là mặc định của vật tư.
  // Khi bỏ override về mặc định (`item.* !== null`), lấy số mặc định từ `GET /materials/{slug}` nếu đã tải.
  const effMin =
    draft.minimumInventory !== undefined
      ? draft.minimumInventory
      : item.minimumInventory === null
        ? item.effectiveMinimumInventory
        : defaults?.minimumInventory
  const effMax =
    draft.maximumInventory !== undefined
      ? draft.maximumInventory
      : item.maximumInventory === null
        ? item.effectiveMaximumInventory
        : defaults?.maximumInventory

  // Quy ước BA: tối đa = 0 là không giới hạn, không chặn khi tối thiểu > 0.
  if (effMin !== undefined && effMax !== undefined && effMax > 0 && effMax < effMin) {
    if (draft.maximumInventory !== undefined) {
      errors.maximumInventory = { key: 'inventory:thresholdRange' }
    } else {
      errors.minimumInventory = {
        key: 'inventory:thresholdMinAboveDefaultMax',
        values: { max: effMax },
      }
    }
  }
  return errors
}

/** Ánh xạ mã lỗi ngưỡng từ BE về đúng ô đang sửa; mã khác trả `null`. */
export function mapThresholdApiError(
  code: number | undefined,
  patch: InventoryThresholdPatch,
): ThresholdEditErrors | null {
  if (code === INVENTORY_MINIMUM_INVALID) {
    return { minimumInventory: { key: 'inventory:thresholdInvalid' } }
  }
  if (code === INVENTORY_MAXIMUM_INVALID) {
    return { maximumInventory: { key: 'inventory:thresholdInvalid' } }
  }
  if (code === INVENTORY_RANGE_INVALID) {
    if (patch.maximumInventory !== undefined && patch.maximumInventory !== null) {
      return { maximumInventory: { key: 'inventory:thresholdRange' } }
    }
    if (patch.minimumInventory !== undefined && patch.minimumInventory !== null) {
      return { minimumInventory: { key: 'inventory:thresholdRange' } }
    }
    if (patch.maximumInventory === null) {
      return { maximumInventory: { key: 'inventory:thresholdRange' } }
    }
    return { minimumInventory: { key: 'inventory:thresholdRange' } }
  }
  return null
}
