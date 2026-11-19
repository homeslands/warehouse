import { SHEET_ROUTES } from './useLeaveSheetOnSessionChange'

describe('SHEET_ROUTES', () => {
  it('có đủ sheet của tab Xuất (đổi phiên giữa chừng thì rời sheet)', () => {
    expect(SHEET_ROUTES).toEqual(
      expect.arrayContaining([
        '/export-filter',
        '/export-line',
        '/export-type',
        '/export-receiver',
        '/scan-export-line',
      ]),
    )
  })

  it('màn quét toàn màn cũng rời khi đổi phiên / kho', () => {
    expect(SHEET_ROUTES).toEqual(
      expect.arrayContaining(['/scan-material', '/scan-line', '/scan-export-line']),
    )
  })

  it('sheet Thông tin phiếu xuất đã bỏ (thông tin nằm trên màn soạn)', () => {
    expect(SHEET_ROUTES).not.toContain('/export-info')
  })

  it('không trùng route', () => {
    expect(new Set(SHEET_ROUTES).size).toBe(SHEET_ROUTES.length)
  })
})
