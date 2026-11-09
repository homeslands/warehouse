import { listQueryFilters, type ListFilterState } from './list-filters'

const NOW = new Date(2026, 10, 5, 9, 0)
const ME = 'u-me'
const OTHER = { slug: 'u-2', name: 'Trần Thị Bình' }
const MINE = { slug: ME, name: 'Tôi' }

const base: ListFilterState = {
  status: 'DRAFT',
  field: 'code',
  query: '',
  time: null,
  requester: null,
  approver: null,
}

const withUsers = { canReadUsers: true, userSlug: ME }
const noUsers = { canReadUsers: false, userSlug: ME }

describe('listQueryFilters — tham số gửi lên GET import-forms', () => {
  it('mặc định: chỉ status', () => {
    expect(listQueryFilters(base, withUsers, NOW)).toEqual({ status: 'DRAFT' })
  })

  it('"Tất cả" trạng thái → không có status; tìm kiếm → field + query', () => {
    expect(
      listQueryFilters(
        { ...base, status: 'ALL', query: 'pn-1', field: 'invoiceCode' },
        withUsers,
        NOW,
      ),
    ).toEqual({ field: 'invoiceCode', query: 'pn-1' })
  })

  it('thời gian: preset tính theo `now` → startDate/endDate', () => {
    expect(listQueryFilters({ ...base, time: 'last7' }, withUsers, NOW)).toEqual({
      status: 'DRAFT',
      startDate: '2026-10-30',
      endDate: '2026-11-05',
    })
    expect(
      listQueryFilters({ ...base, time: { from: '2026-11-03', to: '2026-11-01' } }, withUsers, NOW),
    ).toMatchObject({ startDate: '2026-11-01', endDate: '2026-11-03' })
  })

  it('có USER_READ: người lập / người xác nhận bất kỳ → requesterSlug / approverSlug', () => {
    expect(
      listQueryFilters({ ...base, requester: OTHER, approver: OTHER }, withUsers, NOW),
    ).toEqual({ status: 'DRAFT', requesterSlug: 'u-2', approverSlug: 'u-2' })
  })

  it('mất USER_READ: người khác KHÔNG gửi; "Phiếu của tôi" (người lập = mình) vẫn gửi', () => {
    expect(listQueryFilters({ ...base, requester: OTHER, approver: OTHER }, noUsers, NOW)).toEqual({
      status: 'DRAFT',
    })
    expect(listQueryFilters({ ...base, requester: MINE }, noUsers, NOW)).toEqual({
      status: 'DRAFT',
      requesterSlug: ME,
    })
  })

  it('không USER_READ: người xác nhận không gửi kể cả là mình (chip Người xác nhận bị ẩn)', () => {
    expect(listQueryFilters({ ...base, approver: MINE }, noUsers, NOW)).toEqual({
      status: 'DRAFT',
    })
  })
})
