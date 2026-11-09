import { formatRangeLabel, orderedRange, timeRange } from './time-filter'

/** 05/11/2026 14:30 giờ máy. */
const NOW = new Date(2026, 10, 5, 14, 30)

describe('timeRange — mốc tính theo giờ máy lúc dựng query', () => {
  it('không lọc → không gửi khoá nào', () => {
    expect(timeRange(null, NOW)).toEqual({})
  })

  it('Hôm nay = hôm nay … hôm nay', () => {
    expect(timeRange('today', NOW)).toEqual({ startDate: '2026-11-05', endDate: '2026-11-05' })
  })

  it('7 ngày qua = hôm nay − 6 … hôm nay; 30 ngày qua = hôm nay − 29 … hôm nay', () => {
    expect(timeRange('last7', NOW)).toEqual({ startDate: '2026-10-30', endDate: '2026-11-05' })
    expect(timeRange('last30', NOW)).toEqual({ startDate: '2026-10-07', endDate: '2026-11-05' })
  })

  it('Tháng này = mùng 1 … hôm nay; đúng ngày mùng 1 → một ngày', () => {
    expect(timeRange('thisMonth', NOW)).toEqual({ startDate: '2026-11-01', endDate: '2026-11-05' })
    const first = new Date(2026, 10, 1, 0, 5)
    expect(timeRange('thisMonth', first)).toEqual({
      startDate: '2026-11-01',
      endDate: '2026-11-01',
    })
  })

  it('qua năm: 03/01/2027 → 7 ngày qua bắt đầu 28/12/2026; 30 ngày qua 05/12/2026', () => {
    const jan = new Date(2027, 0, 3, 8, 0)
    expect(timeRange('last7', jan)).toEqual({ startDate: '2026-12-28', endDate: '2027-01-03' })
    expect(timeRange('last30', jan)).toEqual({ startDate: '2026-12-05', endDate: '2027-01-03' })
    expect(timeRange('thisMonth', jan)).toEqual({ startDate: '2027-01-01', endDate: '2027-01-03' })
  })

  it('qua tháng có 28 ngày: 01/03/2026 → 30 ngày qua bắt đầu 31/01/2026', () => {
    expect(timeRange('last30', new Date(2026, 2, 1))).toEqual({
      startDate: '2026-01-31',
      endDate: '2026-03-01',
    })
  })

  it('"Hôm nay" tính lại theo `now` — qua nửa đêm thì là ngày mới (store chỉ giữ id preset)', () => {
    expect(timeRange('today', new Date(2026, 10, 5, 23, 59)).startDate).toBe('2026-11-05')
    expect(timeRange('today', new Date(2026, 10, 6, 0, 1)).startDate).toBe('2026-11-06')
  })

  it('khoảng tự chọn: gửi nguyên hai ngày; ngược chiều → đảo lại', () => {
    expect(timeRange({ from: '2026-10-01', to: '2026-10-15' }, NOW)).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-15',
    })
    expect(timeRange({ from: '2026-10-15', to: '2026-10-01' }, NOW)).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-15',
    })
  })
})

describe('orderedRange', () => {
  it('đến < từ → đảo (như toCreatedRange của web); đúng chiều / bằng nhau → giữ', () => {
    expect(orderedRange('2026-11-05', '2026-11-01')).toEqual({
      from: '2026-11-01',
      to: '2026-11-05',
    })
    expect(orderedRange('2026-11-01', '2026-11-05')).toEqual({
      from: '2026-11-01',
      to: '2026-11-05',
    })
    expect(orderedRange('2026-11-03', '2026-11-03')).toEqual({
      from: '2026-11-03',
      to: '2026-11-03',
    })
  })
})

describe('formatRangeLabel — nhãn chip của khoảng tự chọn', () => {
  it('cùng năm hiện tại → "dd/MM – dd/MM"', () => {
    expect(formatRangeLabel({ from: '2026-10-01', to: '2026-11-05' }, NOW)).toBe('01/10 – 05/11')
  })

  it('một ngày → chỉ một mốc', () => {
    expect(formatRangeLabel({ from: '2026-11-03', to: '2026-11-03' }, NOW)).toBe('03/11')
    expect(formatRangeLabel({ from: '2025-11-03', to: '2025-11-03' }, NOW)).toBe('03/11/2025')
  })

  it('có ngày ngoài năm hiện tại → thêm năm cho cả hai mốc', () => {
    expect(formatRangeLabel({ from: '2025-12-20', to: '2026-01-10' }, NOW)).toBe(
      '20/12/2025 – 10/01/2026',
    )
    expect(formatRangeLabel({ from: '2025-03-01', to: '2025-03-31' }, NOW)).toBe(
      '01/03/2025 – 31/03/2025',
    )
  })

  it('ngược chiều → hiển thị đã đảo', () => {
    expect(formatRangeLabel({ from: '2026-11-05', to: '2026-10-01' }, NOW)).toBe('01/10 – 05/11')
  })
})
