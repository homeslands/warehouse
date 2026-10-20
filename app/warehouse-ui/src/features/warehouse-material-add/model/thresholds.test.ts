import { describe, expect, it } from 'vitest'
import { validateAssignThresholds } from './thresholds'

const defaults = { minimumInventory: 10, maximumInventory: 100 }

describe('validateAssignThresholds', () => {
  it('trống cả hai → hợp lệ (theo ngưỡng của vật tư)', () => {
    expect(validateAssignThresholds({}, defaults)).toEqual({})
  })

  it('số âm / quá 6 số lẻ / vượt trần → lỗi tại đúng ô', () => {
    expect(validateAssignThresholds({ minimumInventory: -1 }, defaults)).toEqual({
      minimumInventory: { key: 'inventory:thresholdInvalid' },
    })
    expect(validateAssignThresholds({ maximumInventory: 0.1234567 }, defaults)).toEqual({
      maximumInventory: { key: 'inventory:thresholdInvalid' },
    })
    expect(validateAssignThresholds({ maximumInventory: 1e12 }, defaults)).toEqual({
      maximumInventory: { key: 'inventory:thresholdTooLarge' },
    })
  })

  it('so theo ngưỡng HIỆU LỰC: tối đa riêng < tối thiểu mặc định → lỗi ở ô tối đa', () => {
    expect(validateAssignThresholds({ maximumInventory: 5 }, defaults)).toEqual({
      maximumInventory: { key: 'inventory:thresholdRange' },
    })
  })

  it('chỉ nhập tối thiểu mà vượt tối đa mặc định → lỗi ở ô tối thiểu, kèm tối đa mặc định', () => {
    expect(validateAssignThresholds({ minimumInventory: 150 }, defaults)).toEqual({
      minimumInventory: { key: 'inventory:thresholdMinAboveDefaultMax', values: { max: 100 } },
    })
  })

  it('nhập cả hai, tối đa < tối thiểu → lỗi ở ô tối đa; bằng nhau thì hợp lệ', () => {
    expect(
      validateAssignThresholds({ minimumInventory: 20, maximumInventory: 15 }, defaults),
    ).toEqual({ maximumInventory: { key: 'inventory:thresholdRange' } })
    expect(
      validateAssignThresholds({ minimumInventory: 20, maximumInventory: 20 }, defaults),
    ).toEqual({})
  })

  it('vật tư chưa đặt max (0): nhập tối thiểu > 0 mà không nhập tối đa → báo cần nhập tối đa', () => {
    expect(
      validateAssignThresholds(
        { minimumInventory: 5 },
        { minimumInventory: 0, maximumInventory: 0 },
      ),
    ).toEqual({
      minimumInventory: { key: 'inventory:thresholdMinAboveDefaultMax', values: { max: 0 } },
    })
  })
})
