import { describe, expect, it } from 'vitest'
import { compareBatchesFefo } from './sort'

const b = (slug: string, expiryDate: string | null, entryDate = '2026-01-01') => ({
  slug,
  expiryDate,
  entryDate,
})
const order = (xs: ReturnType<typeof b>[]) => [...xs].sort(compareBatchesFefo).map((x) => x.slug)

describe('compareBatchesFefo', () => {
  it('hạn gần trước, lô không hạn (null) cuối cùng', () => {
    expect(order([b('n', null), b('late', '2027-05-01'), b('soon', '2026-11-01')])).toEqual([
      'soon',
      'late',
      'n',
    ])
  })

  it('cùng hạn: ngày nhập cũ hơn trước (kể cả cùng null)', () => {
    expect(
      order([
        b('new', '2026-12-01', '2026-03-01'),
        b('old', '2026-12-01', '2026-02-01'),
        b('nn', null, '2026-05-01'),
        b('no', null, '2026-04-01'),
      ]),
    ).toEqual(['old', 'new', 'no', 'nn'])
  })

  it('bằng nhau hoàn toàn: giữ thứ tự đầu vào', () => {
    expect(order([b('x', '2026-12-01'), b('y', '2026-12-01'), b('z', null), b('w', null)])).toEqual(
      ['x', 'y', 'z', 'w'],
    )
  })
})
