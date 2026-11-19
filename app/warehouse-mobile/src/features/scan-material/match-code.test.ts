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

describe('matchCode với nhãn <MÃ>*<SERIAL>', () => {
  it('so bằng phần Mã, giữ none.text là chuỗi gốc đã trim', () => {
    expect(matchCode(' vt-xm-040*S1 ', [SON, XM])).toEqual({ kind: 'found', item: XM })
    expect(matchCode(' VT-ZZ*S1 ', [SON, XM])).toEqual({ kind: 'none', text: 'VT-ZZ*S1' })
  })
})

describe('matchCode: nguyên chuỗi khớp trước, rồi mới tới phần Mã của nhãn', () => {
  const STAR = item({ slug: 'i-star', materialCode: 'VT*01', materialSlug: 'star' })
  const VT = item({ slug: 'i-vt', materialCode: 'VT', materialSlug: 'vt' })

  it('mã vật tư có * khớp nguyên chuỗi (trim, không phân biệt hoa thường)', () => {
    expect(matchCode(' vt*01 ', [VT, STAR])).toEqual({ kind: 'found', item: STAR })
  })

  it('nguyên chuỗi không khớp → so phần Mã', () => {
    expect(matchCode('VT*02', [VT, STAR])).toEqual({ kind: 'found', item: VT })
  })
})
