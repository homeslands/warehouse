type WarehouseRef = { slug: string; code: string; name: string }

/** Người nhận của phiếu Chuyển kho khi chọn kho từ danh sách: `Kho: <mã> · <tên>`. */
export const formatWarehouseReceiver = ({
  code,
  name,
}: Pick<WarehouseRef, 'code' | 'name'>): string => `Kho: ${code} · ${name}`

/** Slug kho nếu `text` đúng dạng trên và kho có trong danh sách; còn lại (chữ tự do, kho không thấy) → `null`. */
export function parseWarehouseReceiver(text: string, warehouses: WarehouseRef[]): string | null {
  const value = text.trim()
  return warehouses.find((w) => formatWarehouseReceiver(w) === value)?.slug ?? null
}
