import { describe, expect, it } from 'vitest'
import { resolveDetailTab } from './detail-tab'

const BOTH = { materials: true, transactions: true }

describe('resolveDetailTab (Review Focus #5)', () => {
  it('mặc định materials khi xem được vật tư', () =>
    expect(resolveDetailTab(null, BOTH)).toBe('materials'))
  it('giá trị hợp lệ giữ nguyên', () =>
    expect(resolveDetailTab('transactions', BOTH)).toBe('transactions'))
  it('giá trị lạ → mặc định', () => expect(resolveDetailTab('abc', BOTH)).toBe('materials'))
  it('không xem được vật tư → luôn transactions, kể cả ?tab=materials', () => {
    const v = { materials: false, transactions: true }
    expect(resolveDetailTab('materials', v)).toBe('transactions')
    expect(resolveDetailTab(null, v)).toBe('transactions')
  })
  it('tab Giao dịch tắt → luôn materials, kể cả ?tab=transactions (link cũ)', () => {
    const v = { materials: true, transactions: false }
    expect(resolveDetailTab('transactions', v)).toBe('materials')
    expect(resolveDetailTab(null, v)).toBe('materials')
  })
  it('không tab nào hiện → null', () =>
    expect(resolveDetailTab('transactions', { materials: false, transactions: false })).toBeNull())
})
