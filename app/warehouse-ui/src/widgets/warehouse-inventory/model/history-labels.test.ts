import { describe, expect, it } from 'vitest'
import { importFormCode, isKnownAction, signed } from './history-labels'

describe('history-labels', () => {
  it('nhận đủ 6 mã, mã lạ thì không', () => {
    for (const a of ['ASSIGN', 'ADJUST', 'IMPORT', 'RESERVE', 'RELEASE', 'REMOVE'])
      expect(isKnownAction(a)).toBe(true)
    expect(isKnownAction('TRANSFER')).toBe(false)
  })
  it('ghi chú phiếu nhập → mã phiếu; văn bản khác / null → null', () => {
    expect(importFormCode('Import form P500D03')).toBe('P500D03')
    expect(importFormCode('Import form PN-2026-0001')).toBe('PN-2026-0001')
    expect(importFormCode('Kiểm kê lại')).toBeNull()
    expect(importFormCode(null)).toBeNull()
  })
  it('signed: dương có "+", âm dùng dấu trừ "−"', () => {
    expect(signed(5)).toBe('+5')
    expect(signed(-3)).toBe('−3')
    expect(signed(0)).toBe('0')
  })
})
