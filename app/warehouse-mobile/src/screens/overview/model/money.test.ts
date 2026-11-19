import { countdownLabel, expiryCutoffs } from './money'

describe('expiryCutoffs', () => {
  it('hôm nay và +61 ngày', () => {
    expect(expiryCutoffs(new Date(2026, 10, 11))).toEqual({
      expired: '2026-11-11',
      soon: '2027-01-11',
    })
  })
})

describe('countdownLabel', () => {
  it('quá hạn / hôm nay / còn lại', () => {
    expect(countdownLabel(-4)).toEqual({ key: 'overdue', n: 4 })
    expect(countdownLabel(0)).toEqual({ key: 'today', n: 0 })
    expect(countdownLabel(6)).toEqual({ key: 'left', n: 6 })
  })
})
