import { formatQuantity } from '@/shared/lib/format'

/** "30 KG" khi biết đơn vị gốc; BE chưa trả đơn vị thì chỉ số (không để lại khoảng trắng / "undefined"). */
export function formatStock(value: number, unitCode: string | undefined): string {
  const n = formatQuantity(value)
  return unitCode ? `${n} ${unitCode}` : n
}

/** Ngưỡng hiệu lực "min – max"; cả hai 0 = chưa đặt (`null`). */
export function thresholdRange(min: number, max: number): string | null {
  if (min === 0 && max === 0) return null
  return `${formatQuantity(min)} – ${formatQuantity(max)}`
}
