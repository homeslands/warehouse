import { z } from 'zod'
import { formatQuantity } from '@/shared/lib/format'
import { DECIMAL_18_6_LIMIT, hasAtMostDecimals } from '@/shared/lib/number'
import {
  INVENTORY_MAXIMUM_INVALID,
  INVENTORY_MINIMUM_INVALID,
  INVENTORY_RANGE_INVALID,
  type InventoryItem,
  type InventoryThresholdPatch,
} from '@/entities/inventory'

export type ThresholdFieldDraft =
  { mode: 'default' } | { mode: 'custom'; value: number | undefined }

export type ThresholdDraft = {
  minimumInventory: ThresholdFieldDraft
  maximumInventory: ThresholdFieldDraft
}

export const EMPTY_THRESHOLD_DRAFT: ThresholdDraft = {
  minimumInventory: { mode: 'default' },
  maximumInventory: { mode: 'default' },
}

export type ThresholdKey = keyof ThresholdDraft

const THRESHOLD_KEYS: readonly ThresholdKey[] = ['minimumInventory', 'maximumInventory']

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
  Record<ThresholdKey, { key: ThresholdEditErrorKey; values?: Record<string, string | number> }>
>

export type MaterialThresholdDefaults = {
  minimumInventory?: number
  maximumInventory?: number
}

const thresholdValueSchema = z
  .number({ error: 'inventory:thresholdInvalid' })
  .refine((v) => v >= 0 && hasAtMostDecimals(v, 6), 'inventory:thresholdInvalid')
  .refine((v) => v < DECIMAL_18_6_LIMIT, 'inventory:thresholdTooLarge')

function toFieldDraft(value: number | null): ThresholdFieldDraft {
  return value === null ? { mode: 'default' } : { mode: 'custom', value }
}

function isFieldChanged(field: ThresholdFieldDraft, initial: number | null): boolean {
  return field.mode === 'default' ? initial !== null : field.value !== initial
}

export function initialThresholdDraft(item: ThresholdTarget): ThresholdDraft {
  return {
    minimumInventory: toFieldDraft(item.minimumInventory),
    maximumInventory: toFieldDraft(item.maximumInventory),
  }
}

export function hasThresholdDraftChanges(draft: ThresholdDraft, item: ThresholdTarget): boolean {
  return (
    isFieldChanged(draft.minimumInventory, item.minimumInventory) ||
    isFieldChanged(draft.maximumInventory, item.maximumInventory)
  )
}

/** Chỉ gửi các trường thay đổi hợp lệ; ô custom bị xoá trắng không tự chuyển thành `null`. */
export function buildThresholdPatch(
  draft: ThresholdDraft,
  item: ThresholdTarget,
): InventoryThresholdPatch {
  const patch: InventoryThresholdPatch = {}
  for (const key of THRESHOLD_KEYS) {
    const field = draft[key]
    if (field.mode === 'default') {
      if (item[key] !== null) patch[key] = null
    } else if (field.value !== undefined && field.value !== item[key]) {
      patch[key] = field.value
    }
  }
  return patch
}

export function validateThresholdDraft(
  draft: ThresholdDraft,
  item: ThresholdTarget,
  defaults?: MaterialThresholdDefaults,
): ThresholdEditErrors {
  const errors: ThresholdEditErrors = {}
  for (const key of THRESHOLD_KEYS) {
    const field = draft[key]
    if (field.mode !== 'custom') continue
    const result = thresholdValueSchema.safeParse(field.value)
    if (!result.success) {
      errors[key] = { key: result.error.issues[0].message as ThresholdEditErrorKey }
    }
  }
  if (errors.minimumInventory || errors.maximumInventory) return errors

  // Khi đang giữ mặc định từ đầu (`item.* === null`), `effective*` chính là mặc định của vật tư.
  // Khi bỏ override về mặc định (`item.* !== null`), lấy số mặc định từ `GET /materials/{slug}` nếu đã tải.
  const effMin =
    draft.minimumInventory.mode === 'custom'
      ? draft.minimumInventory.value
      : item.minimumInventory === null
        ? item.effectiveMinimumInventory
        : defaults?.minimumInventory
  const effMax =
    draft.maximumInventory.mode === 'custom'
      ? draft.maximumInventory.value
      : item.maximumInventory === null
        ? item.effectiveMaximumInventory
        : defaults?.maximumInventory

  // Quy ước BA: tối đa = 0 là không giới hạn, không chặn khi tối thiểu > 0.
  if (effMin !== undefined && effMax !== undefined && effMax > 0 && effMax < effMin) {
    const minChanged = isFieldChanged(draft.minimumInventory, item.minimumInventory)
    const maxChanged = isFieldChanged(draft.maximumInventory, item.maximumInventory)
    const minAboveDefaultError = {
      key: 'inventory:thresholdMinAboveDefaultMax' as const,
      values: { max: formatQuantity(effMax) },
    }
    const rangeError = { key: 'inventory:thresholdRange' as const }

    if (minChanged && !maxChanged) {
      errors.minimumInventory =
        draft.maximumInventory.mode === 'default' ? minAboveDefaultError : rangeError
    } else if (maxChanged && !minChanged) {
      errors.maximumInventory = rangeError
    } else if (draft.maximumInventory.mode === 'custom') {
      errors.maximumInventory = rangeError
    } else if (draft.minimumInventory.mode === 'custom') {
      errors.minimumInventory = minAboveDefaultError
    } else {
      errors.maximumInventory = rangeError
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
    const hasMin = 'minimumInventory' in patch
    const hasMax = 'maximumInventory' in patch
    if (hasMin && !hasMax) {
      return { minimumInventory: { key: 'inventory:thresholdRange' } }
    }
    if (hasMax && !hasMin) {
      return { maximumInventory: { key: 'inventory:thresholdRange' } }
    }
    if (patch.maximumInventory !== undefined && patch.maximumInventory !== null) {
      return { maximumInventory: { key: 'inventory:thresholdRange' } }
    }
    if (patch.minimumInventory !== undefined && patch.minimumInventory !== null) {
      return { minimumInventory: { key: 'inventory:thresholdRange' } }
    }
    return { maximumInventory: { key: 'inventory:thresholdRange' } }
  }
  return null
}
