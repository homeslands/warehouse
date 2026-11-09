import { item } from '@/entities/inventory/model/fixtures'

import { matchCode } from './match-code'

const XM = item({ slug: 'i-xm', materialCode: 'VT-XM-040', materialSlug: 'xi-mang' })
const SON = item({ slug: 'i-son', materialCode: 'VT-SN-018', materialSlug: 'son' })

describe('matchCode', () => {
  it('" vt-xm-040 " khớp "VT-XM-040" (trim, không phân biệt hoa thường)', () => {
    expect(matchCode(' vt-xm-040 ', [SON, XM])).toEqual({ kind: 'found', item: XM })
  })

  it('EAN không phải mã nội bộ → none, giữ chữ đã trim', () => {
    expect(matchCode(' 8934563 ', [SON, XM])).toEqual({ kind: 'none', text: '8934563' })
  })

  it('khớp CHÍNH XÁC, không khớp một phần', () => {
    expect(matchCode('VT-XM', [XM])).toEqual({ kind: 'none', text: 'VT-XM' })
  })

  it('danh sách rỗng → none', () => {
    expect(matchCode('VT-XM-040', [])).toEqual({ kind: 'none', text: 'VT-XM-040' })
  })
})

describe('matchCode với dòng phiếu', () => {
  type Line = { key: string; materialCode: string; unit: string }
  const lines: Line[] = [
    { key: 'a|kg', materialCode: 'VT-A', unit: 'kg' },
    { key: 'a|bao', materialCode: 'VT-A', unit: 'bao' },
    { key: 'b|kg', materialCode: 'VT-B', unit: 'kg' },
  ]

  it('trả đúng kiểu phần tử (có key) và lấy phần tử đầu khi trùng mã', () => {
    const r = matchCode(' vt-a ', lines)
    expect(r.kind === 'found' && r.item.key).toBe('a|kg')
  })

  it('không khớp → none', () => {
    expect(matchCode('VT-Z', lines)).toEqual({ kind: 'none', text: 'VT-Z' })
  })
})
