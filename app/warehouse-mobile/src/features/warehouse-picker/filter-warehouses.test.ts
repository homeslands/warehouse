import { SEARCH_MIN_WAREHOUSES, filterWarehouses, shouldShowSearch } from './filter-warehouses'

const w = (name: string, code: string) => ({ slug: code, code, name, isManager: false })
const LIST = [w('Kho Tổng', 'WH1'), w('Kho Thủ Đức', 'TD-02'), w('Công ty MEKONG', 'MEKONG')]

describe('filterWarehouses', () => {
  it('chuỗi rỗng/khoảng trắng → giữ nguyên danh sách', () => {
    expect(filterWarehouses(LIST, '')).toBe(LIST)
    expect(filterWarehouses(LIST, '   ')).toBe(LIST)
  })

  it('khớp tên không phân biệt dấu và hoa thường', () => {
    expect(filterWarehouses(LIST, 'thu duc').map((x) => x.code)).toEqual(['TD-02'])
    expect(filterWarehouses(LIST, 'THỦ')).toHaveLength(1)
    expect(filterWarehouses(LIST, 'cong ty').map((x) => x.code)).toEqual(['MEKONG'])
  })

  it('khớp mã kho', () => {
    expect(filterWarehouses(LIST, 'td-0').map((x) => x.code)).toEqual(['TD-02'])
    expect(filterWarehouses(LIST, 'wh1').map((x) => x.code)).toEqual(['WH1'])
  })

  it('không khớp → rỗng', () => {
    expect(filterWarehouses(LIST, 'zzz')).toEqual([])
  })
})

describe('shouldShowSearch', () => {
  it(`chỉ hiện ô tìm khi có từ ${SEARCH_MIN_WAREHOUSES} kho`, () => {
    expect(SEARCH_MIN_WAREHOUSES).toBe(6)
    expect(shouldShowSearch(5)).toBe(false)
    expect(shouldShowSearch(6)).toBe(true)
  })
})
