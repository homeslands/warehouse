import { parseLabel } from './parse-label'

describe('parseLabel', () => {
  it('không có * → cả chuỗi là Mã (đã trim), không serial', () => {
    expect(parseLabel('  VT-XM-040 ')).toEqual({ code: 'VT-XM-040', serial: null })
  })

  it('<MÃ>*<SERIAL> → tách tại * đầu tiên; serial trim + viết hoa', () => {
    expect(parseLabel(' VT-XM-040* ab12 ')).toEqual({ code: 'VT-XM-040', serial: 'AB12' })
  })

  it('nhiều * → chỉ tách ở * đầu tiên, phần còn lại thuộc serial', () => {
    expect(parseLabel('VT-A*s1*x')).toEqual({ code: 'VT-A', serial: 'S1*X' })
  })

  it('thiếu serial → chỉ có Mã (phần trước *)', () => {
    expect(parseLabel('VT-A*')).toEqual({ code: 'VT-A', serial: null })
    expect(parseLabel('VT-A*   ')).toEqual({ code: 'VT-A', serial: null })
  })

  it('thiếu Mã → coi như chỉ có Mã (rỗng), không serial', () => {
    expect(parseLabel('*S1')).toEqual({ code: '', serial: null })
  })

  it('mã giữ nguyên hoa thường (so khớp không phân biệt ở matchCode), trim quanh *', () => {
    expect(parseLabel('vt-a  * s1')).toEqual({ code: 'vt-a', serial: 'S1' })
  })

  it('chuỗi rỗng → code rỗng', () => {
    expect(parseLabel('   ')).toEqual({ code: '', serial: null })
  })
})
