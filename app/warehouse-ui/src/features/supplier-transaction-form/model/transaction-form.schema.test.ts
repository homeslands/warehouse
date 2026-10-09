import { describe, expect, it } from 'vitest'
import {
  previewAmount,
  transactionFormSchema,
  toTransactionInput,
  type TransactionFormValues,
} from './transaction-form.schema'

const today = new Date(2026, 9, 8, 15, 30)
const base: TransactionFormValues = {
  type: 'PURCHASE',
  materialSlug: 'm-1',
  quantity: 10,
  unitPrice: 125000,
  amount: undefined,
  transactionDate: '2026-10-08',
  note: '',
}
const errorsOf = (v: TransactionFormValues) => {
  const r = transactionFormSchema(today).safeParse(v)
  return r.success
    ? {}
    : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]))
}

describe('transactionFormSchema', () => {
  it('mua hàng hợp lệ', () => expect(errorsOf(base)).toEqual({}))

  it('mua/trả thiếu vật tư, SL, đơn giá → báo đủ cả ba', () => {
    expect(
      errorsOf({
        ...base,
        type: 'RETURN',
        materialSlug: '',
        quantity: undefined,
        unitPrice: undefined,
      }),
    ).toEqual({
      materialSlug: 'suppliers:materialRequired',
      quantity: 'suppliers:quantityRequired',
      unitPrice: 'suppliers:unitPriceRequired',
    })
  })

  it('SL ≤ 0 hoặc 7 số lẻ; đơn giá âm hoặc 3 số lẻ → sai (Review Focus #4)', () => {
    expect(errorsOf({ ...base, quantity: 0 }).quantity).toBe('suppliers:quantityInvalid')
    expect(errorsOf({ ...base, quantity: 1.1234567 }).quantity).toBe('suppliers:quantityInvalid')
    expect(errorsOf({ ...base, quantity: 1.123456 })).toEqual({})
    expect(errorsOf({ ...base, unitPrice: -1 }).unitPrice).toBe('suppliers:unitPriceInvalid')
    expect(errorsOf({ ...base, unitPrice: 1.005 }).unitPrice).toBe('suppliers:unitPriceInvalid')
  })

  it('số < 1e-6 (dạng mũ khi String) vẫn bị chặn', () => {
    expect(errorsOf({ ...base, quantity: 0.0000001 }).quantity).toBe('suppliers:quantityInvalid')
    expect(errorsOf({ ...base, unitPrice: 0.0000001 }).unitPrice).toBe('suppliers:unitPriceInvalid')
    expect(errorsOf({ ...base, type: 'PAYMENT', amount: 0.001 }).amount).toBe(
      'suppliers:amountInvalid',
    )
  })

  it('thanh toán: chỉ cần số tiền > 0, ≤ 2 số lẻ; vật tư/SL/đơn giá còn sót KHÔNG làm lỗi', () => {
    expect(errorsOf({ ...base, type: 'PAYMENT', amount: 500000 })).toEqual({})
    expect(errorsOf({ ...base, type: 'PAYMENT', amount: 0 }).amount).toBe('suppliers:amountInvalid')
    expect(errorsOf({ ...base, type: 'PAYMENT', amount: undefined }).amount).toBe(
      'suppliers:amountRequired',
    )
  })

  it('ngày tương lai → sai', () => {
    expect(errorsOf({ ...base, transactionDate: '2026-10-09' }).transactionDate).toBe(
      'suppliers:dateFuture',
    )
  })
})

describe('toTransactionInput (Review Focus #2)', () => {
  it('thanh toán KHÔNG mang vật tư/SL/đơn giá dù form còn giá trị', () => {
    expect(
      toTransactionInput({ ...base, type: 'PAYMENT', amount: 500000, note: ' trả đợt 1 ' }, today),
    ).toEqual({
      type: 'PAYMENT',
      amount: 500000,
      transactionDate: today.toISOString(),
      note: 'trả đợt 1',
    })
  })
  it('mua hàng KHÔNG mang amount; ghi chú trống bỏ', () => {
    expect(toTransactionInput({ ...base, amount: 999 }, today)).toEqual({
      type: 'PURCHASE',
      materialSlug: 'm-1',
      quantity: 10,
      unitPrice: 125000,
      transactionDate: today.toISOString(),
    })
  })
  it('ngày quá khứ → 12:00 giờ máy (Review Focus #3)', () => {
    expect(
      toTransactionInput({ ...base, transactionDate: '2026-10-01' }, today).transactionDate,
    ).toBe(new Date(2026, 9, 1, 12, 0).toISOString())
  })
})

describe('previewAmount', () => {
  it('làm tròn 2 số lẻ: 0.1 × 3 = 0.3; thiếu một vế → undefined', () => {
    expect(previewAmount(0.1, 3)).toBe(0.3)
    expect(previewAmount(1.5, 33333.33)).toBe(50000)
    // Khớp `roundMoney` của backend (toFixed(2)): 0.5 × 2.23 = 1.115 → 1.11, không phải 1.12.
    expect(previewAmount(0.5, 2.23)).toBe(1.11)
    expect(previewAmount(undefined, 3)).toBeUndefined()
  })
})
