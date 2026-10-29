import { z } from 'zod'
import { DECIMAL_18_6_LIMIT, hasAtMostDecimals } from '@/shared/lib/number'
import type { InventoryThresholdInput } from '@/entities/inventory'

/**
 * Ô ngưỡng tồn (tuỳ chọn): trống = `undefined` = không gửi; ≥ 0, ≤ 6 số lẻ (`IsDecimalWithScale(6)` + `@Min(0)` của
 * backend) và dưới trần `DECIMAL(18,6)` — cùng luật với form vật tư (`features/material-form`).
 */
export const thresholdSchema = z
  .number({ error: 'inventory:thresholdInvalid' })
  .refine((v) => v >= 0 && hasAtMostDecimals(v, 6), 'inventory:thresholdInvalid')
  .refine((v) => v < DECIMAL_18_6_LIMIT, 'inventory:thresholdTooLarge')
  .optional()

type ThresholdKey = keyof InventoryThresholdInput

export type ThresholdErrorKey =
  | 'inventory:thresholdInvalid'
  | 'inventory:thresholdTooLarge'
  | 'inventory:thresholdRange'
  | 'inventory:thresholdMinAboveDefaultMax'

/** Lỗi theo ô: khoá i18n (namespace `inventory`) + tham số chèn. */
export type ThresholdErrors = Partial<
  Record<ThresholdKey, { key: ThresholdErrorKey; values?: Record<string, number> }>
>

/**
 * Kiểm ngưỡng RIÊNG của kho khi gắn vật tư có sẵn. Backend so theo ngưỡng HIỆU LỰC (riêng ?? mặc định của vật tư) —
 * `assertEffectiveRange`, lỗi 100811 — nên FE cũng vậy: chỉ nhập tối thiểu 50 mà tối đa mặc định là 10 là sai.
 * Lỗi khoảng đặt ở ô người dùng vừa nhập (ô kia đang theo vật tư thì không sửa được ở đây).
 */
export function validateAssignThresholds(
  input: InventoryThresholdInput,
  defaults: { minimumInventory: number; maximumInventory: number },
): ThresholdErrors {
  const errors: ThresholdErrors = {}
  for (const k of ['minimumInventory', 'maximumInventory'] as const) {
    const result = thresholdSchema.safeParse(input[k])
    // Message của `thresholdSchema` luôn là một trong các khoá trên.
    if (!result.success) errors[k] = { key: result.error.issues[0].message as ThresholdErrorKey }
  }
  if (errors.minimumInventory || errors.maximumInventory) return errors

  const min = input.minimumInventory ?? defaults.minimumInventory
  const max = input.maximumInventory ?? defaults.maximumInventory
  if (max >= min) return errors
  if (input.maximumInventory !== undefined) {
    errors.maximumInventory = { key: 'inventory:thresholdRange' }
  } else {
    errors.minimumInventory = {
      key: 'inventory:thresholdMinAboveDefaultMax',
      values: { max: defaults.maximumInventory },
    }
  }
  return errors
}
