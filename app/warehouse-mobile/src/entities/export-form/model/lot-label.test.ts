import { formatLotLabel } from './lot-label'

const NOW = new Date(2026, 10, 5, 9, 0)

describe('formatLotLabel', () => {
  it('HSD đầy đủ năm + ngày nhập dd/MM khi cùng năm hiện tại (vi)', () => {
    expect(formatLotLabel({ expiryDate: '2027-03-12', entryDate: '2026-10-05' }, NOW, 'vi')).toBe(
      'HSD 12/03/2027 · nhập 05/10',
    )
  })

  it('ngày nhập khác năm → thêm năm', () => {
    expect(formatLotLabel({ expiryDate: '2027-03-12', entryDate: '2025-10-05' }, NOW, 'vi')).toBe(
      'HSD 12/03/2027 · nhập 05/10/2025',
    )
  })

  it('không HSD → "Không HSD · nhập dd/MM"', () => {
    expect(formatLotLabel({ expiryDate: null, entryDate: '2026-10-05' }, NOW, 'vi')).toBe(
      'Không HSD · nhập 05/10',
    )
  })

  it('thiếu ngày nhập (tải lô lỗi) → chỉ phần HSD', () => {
    expect(formatLotLabel({ expiryDate: '2027-03-12' }, NOW, 'vi')).toBe('HSD 12/03/2027')
    expect(formatLotLabel({ expiryDate: null, entryDate: undefined }, NOW, 'vi')).toBe('Không HSD')
  })

  it('en', () => {
    expect(formatLotLabel({ expiryDate: '2027-03-12', entryDate: '2026-10-05' }, NOW, 'en')).toBe(
      'Exp 12/03/2027 · received 05/10',
    )
    expect(formatLotLabel({ expiryDate: null, entryDate: '2025-10-05' }, NOW, 'en')).toBe(
      'No expiry · received 05/10/2025',
    )
  })

  it('ngày nhập không đọc được → bỏ phần nhập', () => {
    expect(formatLotLabel({ expiryDate: '2027-03-12', entryDate: '' }, NOW, 'vi')).toBe(
      'HSD 12/03/2027',
    )
  })
})
