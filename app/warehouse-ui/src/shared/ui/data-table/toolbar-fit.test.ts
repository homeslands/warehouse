import { describe, expect, it } from 'vitest'
import { requiredToolbarWidth } from './toolbar-fit'

describe('requiredToolbarWidth', () => {
  it('ô tìm (tối thiểu) + các bộ lọc + nút hành động + khoảng cách giữa chúng', () => {
    // 256 + 8 + (120 + 8 + 150) + 8 + 140
    expect(requiredToolbarWidth({ search: 256, filters: [120, 150], actions: 140, gap: 8 })).toBe(
      690,
    )
  })

  it('không có ô tìm / không có nút hành động → không tính khoảng cách của chúng', () => {
    expect(requiredToolbarWidth({ search: 0, filters: [120, 150], actions: 0, gap: 8 })).toBe(278)
  })

  it('không có bộ lọc → 0 (không có gì để gom)', () => {
    expect(requiredToolbarWidth({ search: 256, filters: [], actions: 140, gap: 8 })).toBe(0)
  })
})
