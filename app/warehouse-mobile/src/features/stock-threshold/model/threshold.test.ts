import { item } from '@/entities/inventory/model/fixtures'
import type { CurrentUser } from '@/entities/session'

import {
  canEditThresholds,
  initialThresholdForm,
  thresholdPatch,
  validateThresholdForm,
  type ThresholdForm,
} from './threshold'

const user = (scope: string[], roleName = 'STAFF'): CurrentUser => ({
  userName: 'u',
  roleName,
  scope,
})

describe('canEditThresholds', () => {
  it('đủ 2 quyền → true', () => {
    expect(canEditThresholds(user(['MATERIAL_UPDATE', 'WAREHOUSE_UPDATE']))).toBe(true)
  })
  it('thiếu WAREHOUSE_UPDATE → false', () => {
    expect(canEditThresholds(user(['MATERIAL_UPDATE']))).toBe(false)
  })
  it('thiếu MATERIAL_UPDATE → false', () => {
    expect(canEditThresholds(user(['WAREHOUSE_UPDATE']))).toBe(false)
  })
  it('SUPER_ADMIN theo can → true', () => {
    expect(canEditThresholds(user([], 'SUPER_ADMIN'))).toBe(true)
  })
  it('user null → false', () => {
    expect(canEditThresholds(null)).toBe(false)
  })
})

const own = item({
  minimumInventory: 5,
  maximumInventory: null,
  effectiveMinimumInventory: 5,
  effectiveMaximumInventory: 100,
})

describe('initialThresholdForm', () => {
  it('riêng min 5, max null → min custom, max default kèm số hiển thị', () => {
    expect(initialThresholdForm(own)).toEqual({
      min: { mode: 'custom', text: '5' },
      max: { mode: 'default', shown: 100 },
    })
  })
})

describe('thresholdPatch', () => {
  const init = initialThresholdForm(own)
  it('đổi min 8 → { minimumInventory: 8 }', () => {
    expect(thresholdPatch(init, { ...init, min: { mode: 'custom', text: '8' } })).toEqual({
      minimumInventory: 8,
    })
  })
  it('min về default → null', () => {
    expect(thresholdPatch(init, { ...init, min: { mode: 'default' } })).toEqual({
      minimumInventory: null,
    })
  })
  it('max gõ 50 → { maximumInventory: 50 }', () => {
    expect(thresholdPatch(init, { ...init, max: { mode: 'custom', text: '50' } })).toEqual({
      maximumInventory: 50,
    })
  })
  it('không đổi → {}', () => {
    expect(thresholdPatch(init, init)).toEqual({})
  })
  it("'5,5' và '5.5' → 5.5", () => {
    for (const text of ['5,5', '5.5'])
      expect(thresholdPatch(init, { ...init, min: { mode: 'custom', text } })).toEqual({
        minimumInventory: 5.5,
      })
  })
  it('gõ lại đúng số cũ (5.0) → không đổi', () => {
    expect(thresholdPatch(init, { ...init, min: { mode: 'custom', text: '5.0' } })).toEqual({})
  })
  it('default → default, dù có số hiển thị → không đổi', () => {
    expect(thresholdPatch(init, { ...init, max: { mode: 'default' } })).toEqual({})
  })
})

describe('validateThresholdForm', () => {
  const c = (text: string) => ({ mode: 'custom' as const, text })
  const form = (min: ThresholdForm['min'], max: ThresholdForm['max']): ThresholdForm => ({
    min,
    max,
  })
  it('custom ô trống → required', () => {
    expect(validateThresholdForm(form(c(''), c('5'))).min).toBe('required')
    expect(validateThresholdForm(form(c('1'), c('  '))).max).toBe('required')
  })
  it("'-1' / 'abc' → invalid", () => {
    expect(validateThresholdForm(form(c('-1'), c('5'))).min).toBe('invalid')
    expect(validateThresholdForm(form(c('1'), c('abc'))).max).toBe('invalid')
  })
  it('min 10 max 5 → range', () => {
    expect(validateThresholdForm(form(c('10'), c('5')))).toEqual({ range: true })
  })
  it('min 10, max default hiển thị 0 → range', () => {
    expect(validateThresholdForm(form(c('10'), { mode: 'default', shown: 0 }))).toEqual({
      range: true,
    })
  })
  it('min default không rõ số + max custom 5 → không range', () => {
    expect(validateThresholdForm(form({ mode: 'default' }, c('5')))).toEqual({})
  })
  it('hợp lệ → {}', () => {
    expect(validateThresholdForm(form(c('5'), c('5')))).toEqual({})
  })
})
