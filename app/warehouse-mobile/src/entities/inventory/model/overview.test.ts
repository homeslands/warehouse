import { item } from './fixtures'
import { groupByAttention, stockOverview } from './overview'

const out = item({ slug: 'out', materialName: 'B hết', quantity: 0, isBelowMinimum: true })
const low = item({ slug: 'low', materialName: 'A dưới', quantity: 5, isBelowMinimum: true })
const high = item({ slug: 'high', materialName: 'C vượt', quantity: 500, isAboveMaximum: true })
const ok1 = item({ slug: 'ok1', materialName: 'D ổn' })
const ok2 = item({ slug: 'ok2', materialName: 'E ổn' })

describe('stockOverview', () => {
  it('đếm tổng + từng mức tồn (hết tính riêng, không tính vào dưới min)', () => {
    expect(stockOverview([out, low, high, ok1, ok2])).toEqual({
      total: 5,
      out: 1,
      low: 1,
      high: 1,
      ok: 2,
    })
  })

  it('rỗng → toàn 0', () => {
    expect(stockOverview([])).toEqual({ total: 0, out: 0, low: 0, high: 0, ok: 0 })
  })
})

describe('groupByAttention', () => {
  it('cần chú ý: hết → dưới min → vượt max, giữ thứ tự đầu vào trong cùng mức; còn lại là bình thường', () => {
    // Đầu vào đã xếp theo tên (filterInventory): A dưới, B hết, C vượt, D ổn, E ổn.
    const low2 = item({ slug: 'low2', materialName: 'F dưới', quantity: 1, isBelowMinimum: true })
    const g = groupByAttention([low, out, high, ok1, ok2, low2])
    expect(g.attention.map((i) => i.slug)).toEqual(['out', 'low', 'low2', 'high'])
    expect(g.normal.map((i) => i.slug)).toEqual(['ok1', 'ok2'])
  })

  it('không có vật tư cần chú ý → nhóm cần chú ý rỗng', () => {
    expect(groupByAttention([ok1, ok2])).toEqual({ attention: [], normal: [ok1, ok2] })
  })
})
