import { hasChipFilters, listChipQuery } from './people'
import type { ChipFilters } from './store'

const NOW = new Date(2026, 10, 5, 9, 0)
const ME = 'u-me'
const OTHER = { slug: 'u-2', name: 'Trần Thị Bình' }
const MINE = { slug: ME, name: 'Tôi' }

const base: ChipFilters = { time: null, requester: null, approver: null }
const withUsers = { canReadUsers: true, userSlug: ME }
const noUsers = { canReadUsers: false, userSlug: ME }

describe('listChipQuery — phần thời gian + người của query danh sách', () => {
  it('mặc định: rỗng', () => {
    expect(listChipQuery(base, withUsers, NOW)).toEqual({})
  })

  it('thời gian: preset tính theo `now`; khoảng ngược được đảo', () => {
    expect(listChipQuery({ ...base, time: 'last7' }, withUsers, NOW)).toEqual({
      startDate: '2026-10-30',
      endDate: '2026-11-05',
    })
    expect(
      listChipQuery({ ...base, time: { from: '2026-11-03', to: '2026-11-01' } }, withUsers, NOW),
    ).toEqual({ startDate: '2026-11-01', endDate: '2026-11-03' })
  })

  it('có USER_READ: người lập / người xác nhận bất kỳ → requesterSlug / approverSlug', () => {
    expect(listChipQuery({ ...base, requester: OTHER, approver: OTHER }, withUsers, NOW)).toEqual({
      requesterSlug: 'u-2',
      approverSlug: 'u-2',
    })
  })

  it('mất USER_READ: người khác KHÔNG gửi; "của tôi" (người lập) vẫn gửi; người xác nhận không gửi kể cả là mình', () => {
    expect(listChipQuery({ ...base, requester: OTHER, approver: OTHER }, noUsers, NOW)).toEqual({})
    expect(listChipQuery({ ...base, requester: MINE }, noUsers, NOW)).toEqual({
      requesterSlug: ME,
    })
    expect(listChipQuery({ ...base, approver: MINE }, noUsers, NOW)).toEqual({})
  })
})

describe('hasChipFilters — "Xoá lọc" / trạng thái rỗng có bộ lọc', () => {
  it('không có chip → không tính', () => {
    expect(hasChipFilters(base, withUsers)).toBe(false)
  })

  it('thời gian, người lập, người xác nhận → tính', () => {
    expect(hasChipFilters({ ...base, time: 'today' }, withUsers)).toBe(true)
    expect(hasChipFilters({ ...base, requester: OTHER }, withUsers)).toBe(true)
    expect(hasChipFilters({ ...base, approver: OTHER }, withUsers)).toBe(true)
  })

  it('bộ lọc người không còn được gửi (mất USER_READ) → không tính', () => {
    expect(hasChipFilters({ ...base, requester: OTHER, approver: MINE }, noUsers)).toBe(false)
    expect(hasChipFilters({ ...base, requester: MINE }, noUsers)).toBe(true)
  })
})
