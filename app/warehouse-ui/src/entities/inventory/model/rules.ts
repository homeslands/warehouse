/**
 * BE chỉ cho gỡ vật tư khỏi kho khi tồn = 0 (100807) và giữ chỗ = 0 (100813) — FE khoá sẵn để không bấm vào một lỗi.
 * Tồn được xét trước: còn tồn thì lý do "còn tồn" là đủ.
 */
export function removeBlockReason(item: {
  quantity: number
  reservedQuantity: number
}): 'stock' | 'reserved' | null {
  if (item.quantity > 0) return 'stock'
  if (item.reservedQuantity > 0) return 'reserved'
  return null
}
