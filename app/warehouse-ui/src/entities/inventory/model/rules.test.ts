import { describe, expect, it } from 'vitest'
import { removeBlockReason } from './rules'

describe('removeBlockReason', () => {
  it('tồn > 0 → stock (ưu tiên trước giữ chỗ)', () => {
    expect(removeBlockReason({ quantity: 5, reservedQuantity: 2 })).toBe('stock')
  })
  it('tồn 0 nhưng còn giữ chỗ → reserved', () => {
    expect(removeBlockReason({ quantity: 0, reservedQuantity: 3 })).toBe('reserved')
  })
  it('cả hai 0 → null (gỡ được)', () => {
    expect(removeBlockReason({ quantity: 0, reservedQuantity: 0 })).toBeNull()
  })
})
