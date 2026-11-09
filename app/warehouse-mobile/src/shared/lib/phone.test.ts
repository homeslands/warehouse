import { digitsOnly, formatPhone, normalizeVnPhone } from './phone'

describe('digitsOnly', () => {
  it('bỏ mọi ký tự không phải số', () => {
    expect(digitsOnly('0340 000-000')).toBe('0340000000')
    expect(digitsOnly('(+84) 912.345.678')).toBe('84912345678')
    expect(digitsOnly('')).toBe('')
  })
})

describe('formatPhone', () => {
  it('nhóm số 10 chữ số theo 4-3-3', () => {
    expect(formatPhone('0340000000')).toBe('0340 000 000')
    expect(formatPhone('0912345678')).toBe('0912 345 678')
  })

  it('nhóm dần khi đang gõ', () => {
    expect(formatPhone('0')).toBe('0')
    expect(formatPhone('0912')).toBe('0912')
    expect(formatPhone('09123')).toBe('0912 3')
    expect(formatPhone('0912345')).toBe('0912 345')
    expect(formatPhone('09123456')).toBe('0912 345 6')
  })

  it('chuẩn hoá chuỗi đã có khoảng trắng/gạch', () => {
    expect(formatPhone('0912-345 678')).toBe('0912 345 678')
    expect(formatPhone(' 0912 345678 ')).toBe('0912 345 678')
  })

  it('rỗng → rỗng', () => {
    expect(formatPhone('')).toBe('')
    expect(formatPhone('   ')).toBe('')
  })

  it('dài hơn 10 chữ số → giữ nguyên như người dùng viết', () => {
    expect(formatPhone('84912345678')).toBe('84912345678')
    expect(formatPhone('+84 912 345 678')).toBe('+84 912 345 678')
  })

  it('có chữ (tài khoản như root) → giữ nguyên', () => {
    expect(formatPhone('root')).toBe('root')
    expect(formatPhone('admin01')).toBe('admin01')
  })
})

describe('normalizeVnPhone', () => {
  it('+84 / 84 / 0084 + 9 chữ số → 0 + 9 chữ số (số tự điền từ danh bạ)', () => {
    expect(normalizeVnPhone('+84 912 345 678')).toBe('0912345678')
    expect(normalizeVnPhone('84912345678')).toBe('0912345678')
    expect(normalizeVnPhone('0084 912 345 678')).toBe('0912345678')
    expect(normalizeVnPhone('+84-340-000-000')).toBe('0340000000')
  })

  it('đã là 0… → chỉ bỏ ký tự không phải số', () => {
    expect(normalizeVnPhone('0912 345 678')).toBe('0912345678')
  })

  it('đang gõ dở không bị đổi', () => {
    expect(normalizeVnPhone('8')).toBe('8')
    expect(normalizeVnPhone('84')).toBe('84')
    expect(normalizeVnPhone('849123')).toBe('849123')
    expect(normalizeVnPhone('0084')).toBe('0084')
    expect(normalizeVnPhone('091')).toBe('091')
  })

  it('84 + số chữ số khác 9 → giữ nguyên chữ số', () => {
    expect(normalizeVnPhone('849123456789')).toBe('849123456789')
  })
})
