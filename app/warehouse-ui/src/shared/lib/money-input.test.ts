import { describe, expect, it } from 'vitest'
import {
  caretAfterNormalize,
  formatMoneyText,
  moneySeparators,
  moneyTextToNumber,
  normalizeMoneyText,
} from './money-input'

const vi = moneySeparators('vi')
const en = moneySeparators('en')

describe('normalizeMoneyText', () => {
  it.each([
    ['1500000', '1.500.000'],
    ['1.500.000', '1.500.000'],
    ['1,500,000', '1.500.000'], // dấu xuất hiện nhiều lần là dấu nhóm
    ['1.500', '1.500'], // một dấu chấm trong tiếng Việt là nhóm nghìn
    ['1500,5', '1.500,5'],
    ['1.500,', '1.500,'], // đang gõ phần lẻ
    ['1,500.5', '1.500,5'], // cả hai loại → dấu sau cùng là thập phân
    ['1500,567', '1.500,56'], // tối đa 2 số lẻ
    [',5', '0,5'],
    ['007', '7'],
    ['0', '0'],
    ['12ab3 ₫', '123'],
    ['', ''],
    ['abc', ''],
  ])('vi: %j → %j', (raw, out) => {
    expect(normalizeMoneyText(raw, vi)).toBe(out)
  })

  it('en: dấu phẩy nhóm nghìn, dấu chấm thập phân', () => {
    expect(normalizeMoneyText('1500000.5', en)).toBe('1,500,000.5')
    expect(normalizeMoneyText('1.500.000', en)).toBe('1,500,000')
    expect(normalizeMoneyText('1,500', en)).toBe('1,500')
  })

  it('maxFractionDigits = 0 bỏ hẳn phần lẻ', () => {
    expect(normalizeMoneyText('1500,5', vi, 0)).toBe('15.005')
  })

  it('cắt ở 15 chữ số phần nguyên', () => {
    expect(normalizeMoneyText('1234567890123456789', vi)).toBe('123.456.789.012.345')
  })
})

describe('moneyTextToNumber / formatMoneyText', () => {
  it('đọc chuỗi đã chuẩn hoá', () => {
    expect(moneyTextToNumber('1.500.000,5', vi)).toBe(1500000.5)
    expect(moneyTextToNumber('1,500,000.5', en)).toBe(1500000.5)
    expect(moneyTextToNumber('1.500,', vi)).toBe(1500)
    expect(moneyTextToNumber('', vi)).toBeUndefined()
  })

  it('số → chuỗi, bỏ số 0 thừa ở phần lẻ', () => {
    expect(formatMoneyText(1500000, vi)).toBe('1.500.000')
    expect(formatMoneyText(1500.5, vi)).toBe('1.500,5')
    expect(formatMoneyText(0, vi)).toBe('0')
    expect(formatMoneyText(1500.5, en)).toBe('1,500.5')
    expect(formatMoneyText(undefined, vi)).toBe('')
  })
})

describe('caretAfterNormalize', () => {
  it('gõ thêm chữ số ở cuối → con trỏ ở cuối dù có thêm dấu nhóm', () => {
    // "1.500" + gõ "0" → "1.5000" → "15.000"
    expect(caretAfterNormalize('1.5000', 6, '15.000', vi)).toBe(6)
  })

  it('gõ giữa chuỗi → con trỏ đứng sau chữ số vừa gõ', () => {
    // "1.500" chèn "2" sau "1" → "12.500" (raw "12.500", caret 2) → "12.500", con trỏ sau "2"
    expect(caretAfterNormalize('12.500', 2, '12.500', vi)).toBe(2)
    // "15.000" xoá "5" → raw "1.000" (caret 1) → "1.000", con trỏ sau "1"
    expect(caretAfterNormalize('1.000', 1, '1.000', vi)).toBe(1)
    // "999" chèn "1" ở đầu → "1999" → "1.999", con trỏ sau "1"
    expect(caretAfterNormalize('1999', 1, '1.999', vi)).toBe(1)
  })

  it('vừa gõ dấu thập phân → con trỏ sau dấu thập phân', () => {
    expect(caretAfterNormalize('1.500,', 6, '1.500,', vi)).toBe(6)
    expect(caretAfterNormalize(',', 1, '0,', vi)).toBe(2)
  })
})
