import { describe, expect, it } from 'vitest'
import { importFormStepStatus } from './steps'

const line = (over: Record<string, unknown> = {}) => ({
  materialSlug: 'm-1',
  unitSlug: 'u-1',
  quantity: 2,
  unitPrice: 1000,
  supplierOverride: '',
  ...over,
})

const values = (over: Record<string, unknown> = {}) =>
  ({ supplierSlug: 's-1', invoiceCode: 'HD-1', items: [line()], ...over }) as never

describe('importFormStepStatus', () => {
  it('① xong khi có số hoá đơn và bên bán', () => {
    expect(importFormStepStatus(values(), { requireSupplier: true }).sellerDone).toBe(true)
  })

  it('① chưa xong khi thiếu bên bán (chọn được NCC) hoặc số hoá đơn chỉ có khoảng trắng', () => {
    expect(
      importFormStepStatus(values({ supplierSlug: '' }), { requireSupplier: true }).sellerDone,
    ).toBe(false)
    expect(
      importFormStepStatus(values({ invoiceCode: '   ' }), { requireSupplier: true }).sellerDone,
    ).toBe(false)
  })

  it('không chọn được NCC thì ① chỉ cần số hoá đơn', () => {
    expect(
      importFormStepStatus(values({ supplierSlug: '' }), { requireSupplier: false }).sellerDone,
    ).toBe(true)
  })

  it('② đếm dòng đủ vật tư, đơn vị, số lượng > 0, đơn giá ≥ 0 (giá 0 vẫn tính)', () => {
    const s = importFormStepStatus(
      values({
        items: [
          line(),
          line({ unitPrice: 0 }),
          line({ materialSlug: '' }),
          line({ quantity: 0 }),
          line({ quantity: undefined }),
          line({ unitPrice: undefined }),
        ],
      }),
      { requireSupplier: true },
    )
    expect(s).toEqual({ sellerDone: true, itemsDone: true, lineCount: 2 })
  })

  it('② chưa xong khi chưa có dòng nào đủ', () => {
    const s = importFormStepStatus(values({ items: [line({ unitSlug: '' })] }), {
      requireSupplier: true,
    })
    expect(s.itemsDone).toBe(false)
    expect(s.lineCount).toBe(0)
  })
})
