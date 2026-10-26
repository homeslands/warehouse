import { formatQuantity } from '@/shared/lib/format'

/** "30 KG" khi biết đơn vị gốc; vật tư chưa có đơn vị gốc thì chỉ số (không để lại khoảng trắng / "undefined"). */
export function formatStock(value: number, unitCode: string | undefined): string {
  const n = formatQuantity(value)
  return unitCode ? `${n} ${unitCode}` : n
}

/** Ngưỡng hiệu lực "min – max [đơn vị]"; cả hai 0 = chưa đặt (`null`). */
export function thresholdRange(min: number, max: number, unitCode?: string): string | null {
  if (min === 0 && max === 0) return null
  const range = `${formatQuantity(min)} – ${formatQuantity(max)}`
  return unitCode ? `${range} ${unitCode}` : range
}
