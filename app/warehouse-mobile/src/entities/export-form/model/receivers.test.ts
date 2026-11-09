import { matchSuggestions, recentReceivers } from './receivers'

const f = (receiver: string, createdAt: string) => ({ receiver, createdAt })

describe('recentReceivers', () => {
  it('mới nhất trước; bỏ trùng không phân biệt hoa thường / khoảng trắng thừa (giữ cách viết mới nhất)', () => {
    expect(
      recentReceivers([
        f('Tổ hàn A', '2026-11-01T08:00:00Z'),
        f('Bếp B', '2026-11-05T08:00:00Z'),
        f('  tổ hàn a ', '2026-11-04T08:00:00Z'),
        f('Kho Hà Nội', '2026-11-03T08:00:00Z'),
      ]),
    ).toEqual(['Bếp B', 'tổ hàn a', 'Kho Hà Nội'])
  })

  it('bỏ người nhận rỗng', () => {
    expect(
      recentReceivers([f('  ', '2026-11-05T08:00:00Z'), f('A', '2026-11-01T08:00:00Z')]),
    ).toEqual(['A'])
  })
})

describe('matchSuggestions', () => {
  const all = ['Bếp B', 'Tổ hàn A', 'Tổ điện', 'Kho Hà Nội']

  it('ô trống → tất cả, tối đa 8', () => {
    expect(matchSuggestions(all, '')).toEqual(all)
    const many = Array.from({ length: 12 }, (_, i) => `Người ${i}`)
    expect(matchSuggestions(many, '')).toHaveLength(8)
  })

  it('lọc theo chữ đang gõ, bỏ dấu + không phân biệt hoa thường; giữ thứ tự', () => {
    expect(matchSuggestions(all, 'TO')).toEqual(['Tổ hàn A', 'Tổ điện'])
    expect(matchSuggestions(all, 'dien')).toEqual(['Tổ điện'])
  })

  it('đúng y chữ đang gõ → không gợi ý lại chính nó', () => {
    expect(matchSuggestions(all, 'bep b')).toEqual([])
  })
})
