import type { Unit } from './types'
import { unitUsage } from './usage'

const unit = (materialCount?: Unit['materialCount']): Unit => ({
  slug: 'kg',
  code: 'KG',
  name: 'Kg',
  createdAt: '',
  updatedAt: '',
  materialCount,
})

describe('unitUsage', () => {
  it('conversion = conversion - base, total lấy từ backend', () => {
    expect(unitUsage(unit({ asBaseUnit: 3, asConversionUnit: 5, total: 6 }))).toEqual({
      base: 3,
      conversion: 2,
      total: 6,
    })
  })
  it('conversion không âm', () => {
    expect(unitUsage(unit({ asBaseUnit: 1, asConversionUnit: 0, total: 1 })).conversion).toBe(0)
  })
  it('thiếu materialCount thì toàn 0', () => {
    expect(unitUsage(unit())).toEqual({ base: 0, conversion: 0, total: 0 })
  })
})
