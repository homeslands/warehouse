import type { MaterialBatch } from './types'

/**
 * Thứ tự FEFO như BE: hạn dùng gần nhất trước, lô không hạn (null) cuối cùng, cùng hạn thì
 * ngày nhập cũ hơn trước. MySQL xếp NULL lên đầu khi ASC nên phải sắp lại ở client.
 * Ngày là chuỗi YYYY-MM-DD nên so sánh chuỗi là đủ.
 */
export function compareBatchesFefo(
  a: Pick<MaterialBatch, 'expiryDate' | 'entryDate'>,
  b: Pick<MaterialBatch, 'expiryDate' | 'entryDate'>,
): number {
  if (a.expiryDate !== b.expiryDate) {
    if (a.expiryDate === null) return 1
    if (b.expiryDate === null) return -1
    return a.expiryDate < b.expiryDate ? -1 : 1
  }
  if (a.entryDate === b.entryDate) return 0
  return a.entryDate < b.entryDate ? -1 : 1
}
