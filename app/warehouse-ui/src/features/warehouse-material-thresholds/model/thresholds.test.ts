import { describe, expect, it } from 'vitest'
import {
  buildThresholdPatch,
  initialThresholdDraft,
  mapThresholdApiError,
  validateThresholdDraft,
  type ThresholdTarget,
} from './thresholds'

const makeItem = (over: Partial<ThresholdTarget> = {}): ThresholdTarget => ({
  materialSlug: 'm-1',
  materialCode: 'VT-01',
  materialName: 'Đường cát',
  minimumInventory: null,
  maximumInventory: null,
  effectiveMinimumInventory: 10,
  effectiveMaximumInventory: 100,
  baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' },
  ...over,
})

describe('warehouse-material-thresholds model', () => {
  it('initialThresholdDraft giữ override hiện có và chuyển null thành undefined', () => {
    expect(initialThresholdDraft(makeItem())).toEqual({
      minimumInventory: undefined,
      maximumInventory: undefined,
    })
    expect(initialThresholdDraft(makeItem({ minimumInventory: 0, maximumInventory: 50 }))).toEqual({
      minimumInventory: 0,
      maximumInventory: 50,
    })
  })

  it('buildThresholdPatch chỉ gửi trường đổi; bỏ override thành null; giữ số 0', () => {
    const customItem = makeItem({ minimumInventory: 20, maximumInventory: 80 })
    expect(buildThresholdPatch({ minimumInventory: 20, maximumInventory: 80 }, customItem)).toEqual(
      {},
    )
    expect(
      buildThresholdPatch({ minimumInventory: undefined, maximumInventory: 0 }, customItem),
    ).toEqual({
      minimumInventory: null,
      maximumInventory: 0,
    })
    expect(
      buildThresholdPatch({ minimumInventory: 15, maximumInventory: undefined }, makeItem()),
    ).toEqual({
      minimumInventory: 15,
    })
  })

  it('validateThresholdDraft kiểm định dạng số (âm, quá 6 số lẻ, vượt trần)', () => {
    const item = makeItem()
    expect(validateThresholdDraft({ minimumInventory: -1 }, item)).toEqual({
      minimumInventory: { key: 'inventory:thresholdInvalid' },
    })
    expect(validateThresholdDraft({ maximumInventory: 0.1234567 }, item)).toEqual({
      maximumInventory: { key: 'inventory:thresholdInvalid' },
    })
    expect(validateThresholdDraft({ maximumInventory: 1e12 }, item)).toEqual({
      maximumInventory: { key: 'inventory:thresholdTooLarge' },
    })
  })

  it('validateThresholdDraft coi max = 0 là không giới hạn (hợp lệ dù min > 0)', () => {
    expect(
      validateThresholdDraft(
        { minimumInventory: 50, maximumInventory: 0 },
        makeItem({ effectiveMaximumInventory: 0 }),
      ),
    ).toEqual({})
    expect(
      validateThresholdDraft(
        { minimumInventory: 50 },
        makeItem({ minimumInventory: null, maximumInventory: null, effectiveMaximumInventory: 0 }),
      ),
    ).toEqual({})
  })

  it('validateThresholdDraft kiểm max > 0 nhỏ hơn min theo giá trị hiệu lực', () => {
    const defaultItem = makeItem({
      minimumInventory: null,
      maximumInventory: null,
      effectiveMinimumInventory: 20,
      effectiveMaximumInventory: 100,
    })
    expect(validateThresholdDraft({ maximumInventory: 10 }, defaultItem)).toEqual({
      maximumInventory: { key: 'inventory:thresholdRange' },
    })
    expect(validateThresholdDraft({ minimumInventory: 150 }, defaultItem)).toEqual({
      minimumInventory: { key: 'inventory:thresholdMinAboveDefaultMax', values: { max: 100 } },
    })
    expect(
      validateThresholdDraft({ minimumInventory: 60, maximumInventory: 50 }, defaultItem),
    ).toEqual({
      maximumInventory: { key: 'inventory:thresholdRange' },
    })
  })

  it('validateThresholdDraft kiểm theo mặc định từ material khi bỏ override ở 1 bên', () => {
    const customItem = makeItem({
      minimumInventory: 10,
      maximumInventory: 100,
      effectiveMinimumInventory: 10,
      effectiveMaximumInventory: 100,
    })
    expect(
      validateThresholdDraft({ minimumInventory: 60, maximumInventory: undefined }, customItem, {
        minimumInventory: 5,
        maximumInventory: 40,
      }),
    ).toEqual({
      minimumInventory: { key: 'inventory:thresholdMinAboveDefaultMax', values: { max: 40 } },
    })
  })

  it('mapThresholdApiError đưa lỗi 100809/100810/100811 về đúng ô', () => {
    expect(mapThresholdApiError(100809, {})).toEqual({
      minimumInventory: { key: 'inventory:thresholdInvalid' },
    })
    expect(mapThresholdApiError(100810, {})).toEqual({
      maximumInventory: { key: 'inventory:thresholdInvalid' },
    })
    expect(mapThresholdApiError(100811, { minimumInventory: 50 })).toEqual({
      minimumInventory: { key: 'inventory:thresholdRange' },
    })
    expect(mapThresholdApiError(100811, { maximumInventory: 10 })).toEqual({
      maximumInventory: { key: 'inventory:thresholdRange' },
    })
    expect(mapThresholdApiError(100811, { maximumInventory: null })).toEqual({
      maximumInventory: { key: 'inventory:thresholdRange' },
    })
    expect(mapThresholdApiError(100801, {})).toBeNull()
  })
})
