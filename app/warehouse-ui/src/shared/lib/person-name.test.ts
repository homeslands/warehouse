import { describe, expect, it } from 'vitest'
import { formatFullName, formatPersonLabel, initialsOf } from './person-name'

describe('formatFullName', () => {
  it('họ trước tên, bỏ khoảng trắng thừa', () => {
    expect(formatFullName({ lastName: ' Nguyễn ', firstName: 'Văn A' })).toBe('Nguyễn Văn A')
  })

  it('thiếu một phần → dùng phần còn lại; rỗng / null → chuỗi rỗng', () => {
    expect(formatFullName({ firstName: 'An', lastName: '' })).toBe('An')
    expect(formatFullName({ firstName: '', lastName: null })).toBe('')
    expect(formatFullName({})).toBe('')
  })
})

describe('initialsOf', () => {
  it('nhiều từ → chữ đầu của từ đầu và từ cuối', () => {
    expect(initialsOf('Nguyễn Văn An')).toBe('NA')
  })

  it('một từ → hai ký tự đầu; rỗng → "?"', () => {
    expect(initialsOf('root')).toBe('RO')
    expect(initialsOf('0310000000')).toBe('03')
    expect(initialsOf('  ')).toBe('?')
  })
})

describe('formatPersonLabel', () => {
  it('có họ tên → "Họ Tên (số điện thoại)"', () => {
    expect(
      formatPersonLabel({ phonenumber: '0901234567', lastName: 'Nguyễn', firstName: 'Văn A' }),
    ).toBe('Nguyễn Văn A (0901234567)')
  })

  it('tên rỗng / chỉ khoảng trắng / không có → chỉ số điện thoại', () => {
    expect(formatPersonLabel({ phonenumber: '0901234567', firstName: '', lastName: '  ' })).toBe(
      '0901234567',
    )
    expect(formatPersonLabel({ phonenumber: '0901234567' })).toBe('0901234567')
  })
})
