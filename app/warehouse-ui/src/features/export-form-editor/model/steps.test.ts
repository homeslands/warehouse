import { describe, expect, it } from 'vitest'
import { exportFormStepStatus } from './steps'

const line = (over: Record<string, unknown> = {}) => ({
  materialSlug: 'm',
  unitSlug: 'u',
  quantity: 2,
  unitPrice: 1000,
  batchSlug: '',
  note: '',
  ...over,
})
const values = (over: Record<string, unknown> = {}) =>
  ({ type: 'SALE', receiver: 'A', purchaseOrder: 'PO', items: [line()], ...over }) as never

describe('exportFormStepStatus', () => {
  it('① xong khi có type, người nhận, PO', () => {
    expect(exportFormStepStatus(values(), { sale: true }).infoDone).toBe(true)
    expect(exportFormStepStatus(values({ type: undefined }), { sale: true }).infoDone).toBe(false)
    expect(exportFormStepStatus(values({ receiver: ' ' }), { sale: true }).infoDone).toBe(false)
    expect(exportFormStepStatus(values({ purchaseOrder: '' }), { sale: true }).infoDone).toBe(false)
  })

  it('② Bán cần đơn giá ≥ 0', () => {
    const items = [
      line(),
      line({ unitPrice: undefined }),
      line({ quantity: 0 }),
      line({ materialSlug: '' }),
    ]
    expect(exportFormStepStatus(values({ items }), { sale: true })).toMatchObject({
      itemsDone: true,
      lineCount: 1,
    })
  })

  it('② không phải Bán bỏ qua đơn giá', () => {
    const items = [line({ unitPrice: undefined }), line({ quantity: undefined })]
    expect(exportFormStepStatus(values({ items }), { sale: false })).toMatchObject({
      itemsDone: true,
      lineCount: 1,
    })
    expect(exportFormStepStatus(values({ items: [] }), { sale: false })).toMatchObject({
      itemsDone: false,
      lineCount: 0,
    })
  })
})
