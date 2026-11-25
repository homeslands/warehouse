import { describe, expect, it } from 'vitest'
import { formatQuantity } from '@/shared/lib/format'
import {
  buildThresholdPatch,
  hasThresholdDraftChanges,
  initialThresholdDraft,
  mapThresholdApiError,
  validateThresholdDraft,
  type ThresholdDraft,
  type ThresholdFieldDraft,
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

const makeDraft = (
  minimumInventory: ThresholdFieldDraft = { mode: 'default' },
  maximumInventory: ThresholdFieldDraft = { mode: 'default' },
): ThresholdDraft => ({ minimumInventory, maximumInventory })

const custom = (value: number | undefined): ThresholdFieldDraft => ({ mode: 'custom', value })
const def: ThresholdFieldDraft = { mode: 'default' }

describe('warehouse-material-thresholds model', () => {
  it('initialThresholdDraft giữ override hiện có và chuyển null thành mode default', () => {
    expect(initialThresholdDraft(makeItem())).toEqual(makeDraft())
    expect(initialThresholdDraft(makeItem({ minimumInventory: 0, maximumInventory: 50 }))).toEqual(
      makeDraft(custom(0), custom(50)),
    )
  })

  it('buildThresholdPatch chỉ gửi trường đổi; chỉ mode default mới thành null; ô custom rỗng không thành null', () => {
    const customItem = makeItem({ minimumInventory: 20, maximumInventory: 80 })
    expect(buildThresholdPatch(makeDraft(custom(20), custom(80)), customItem)).toEqual({})
    expect(buildThresholdPatch(makeDraft(def, custom(0)), customItem)).toEqual({
      minimumInventory: null,
      maximumInventory: 0,
    })
    expect(buildThresholdPatch(makeDraft(custom(15), def), makeItem())).toEqual({
      minimumInventory: 15,
    })
    // Xoá trắng ô đang có override riêng → không âm thầm biến thành null.
    expect(buildThresholdPatch(makeDraft(custom(20), custom(undefined)), customItem)).toEqual({})
    expect(hasThresholdDraftChanges(makeDraft(custom(20), custom(undefined)), customItem)).toBe(
      true,
    )
  })

  it('validateThresholdDraft kiểm định dạng số (trống custom, âm, quá 6 số lẻ, vượt trần)', () => {
    const item = makeItem()
    expect(validateThresholdDraft(makeDraft(def, custom(undefined)), item)).toEqual({
      maximumInventory: { key: 'inventory:thresholdInvalid' },
    })
    expect(validateThresholdDraft(makeDraft(custom(-1), def), item)).toEqual({
      minimumInventory: { key: 'inventory:thresholdInvalid' },
    })
    expect(validateThresholdDraft(makeDraft(def, custom(0.1234567)), item)).toEqual({
      maximumInventory: { key: 'inventory:thresholdInvalid' },
    })
    expect(validateThresholdDraft(makeDraft(def, custom(1e12)), item)).toEqual({
      maximumInventory: { key: 'inventory:thresholdTooLarge' },
    })
  })

  it('validateThresholdDraft coi max = 0 là không giới hạn (hợp lệ dù min > 0)', () => {
    expect(
      validateThresholdDraft(
        makeDraft(custom(50), custom(0)),
        makeItem({ effectiveMaximumInventory: 0 }),
      ),
    ).toEqual({})
    expect(
      validateThresholdDraft(
        makeDraft(custom(50), def),
        makeItem({ minimumInventory: null, maximumInventory: null, effectiveMaximumInventory: 0 }),
      ),
    ).toEqual({})
  })

  it('validateThresholdDraft kiểm max > 0 nhỏ hơn min theo giá trị hiệu lực và gắn lỗi vào ô vừa sửa', () => {
    const defaultItem = makeItem({
      minimumInventory: null,
      maximumInventory: null,
      effectiveMinimumInventory: 20,
      effectiveMaximumInventory: 1000,
    })
    expect(validateThresholdDraft(makeDraft(def, custom(10)), defaultItem)).toEqual({
      maximumInventory: { key: 'inventory:thresholdRange' },
    })
    expect(validateThresholdDraft(makeDraft(custom(1500), def), defaultItem)).toEqual({
      minimumInventory: {
        key: 'inventory:thresholdMinAboveDefaultMax',
        values: { max: formatQuantity(1000) },
      },
    })
    expect(validateThresholdDraft(makeDraft(custom(60), custom(50)), defaultItem)).toEqual({
      maximumInventory: { key: 'inventory:thresholdRange' },
    })

    // Cả hai đang có override: chỉ tăng tối thiểu > tối đa hiện có → báo ở ô tối thiểu.
    const customItem = makeItem({
      minimumInventory: 20,
      maximumInventory: 100,
      effectiveMinimumInventory: 20,
      effectiveMaximumInventory: 100,
    })
    expect(validateThresholdDraft(makeDraft(custom(150), custom(100)), customItem)).toEqual({
      minimumInventory: { key: 'inventory:thresholdRange' },
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
      validateThresholdDraft(makeDraft(custom(60), def), customItem, {
        minimumInventory: 5,
        maximumInventory: 40,
      }),
    ).toEqual({
      minimumInventory: {
        key: 'inventory:thresholdMinAboveDefaultMax',
        values: { max: formatQuantity(40) },
      },
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
    expect(mapThresholdApiError(100811, { minimumInventory: null })).toEqual({
      minimumInventory: { key: 'inventory:thresholdRange' },
    })
    expect(mapThresholdApiError(100801, {})).toBeNull()
  })
})
