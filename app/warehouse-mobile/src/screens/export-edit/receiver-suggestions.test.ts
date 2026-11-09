import { receiverSuggestions } from './receiver-suggestions'

const W = (slug: string, name: string, code = slug.toUpperCase()) => ({
  slug,
  code,
  name,
  isManager: false,
})
const warehouses = [
  W('wh-a', 'Kho Tổng'),
  W('wh-hn', 'Kho Hà Nội', 'HN'),
  W('wh-dn', 'Kho Đà Nẵng', 'DN'),
]
const recent = ['Bếp B', 'kho hà nội', 'Tổ hàn A']

describe('receiverSuggestions', () => {
  it('loại khác Chuyển kho: chỉ người nhận gần đây (đúng thứ tự)', () => {
    expect(
      receiverSuggestions({ recent, warehouses, type: 'SALE', currentSlug: 'wh-a', query: '' }),
    ).toEqual([
      { kind: 'recent', value: 'Bếp B' },
      { kind: 'recent', value: 'kho hà nội' },
      { kind: 'recent', value: 'Tổ hàn A' },
    ])
  })

  it('Chuyển kho: thêm các kho chọn được TRỪ kho hiện tại (đánh dấu là kho), trước người nhận gần đây; người nhận trùng tên kho chỉ hiện một lần (là kho)', () => {
    expect(
      receiverSuggestions({ recent, warehouses, type: 'TRANSFER', currentSlug: 'wh-a', query: '' }),
    ).toEqual([
      { kind: 'warehouse', value: 'Kho Hà Nội', code: 'HN', slug: 'wh-hn' },
      { kind: 'warehouse', value: 'Kho Đà Nẵng', code: 'DN', slug: 'wh-dn' },
      { kind: 'recent', value: 'Bếp B' },
      { kind: 'recent', value: 'Tổ hàn A' },
    ])
  })

  it('lọc cả kho (tên hoặc mã) lẫn người nhận theo chữ đang gõ, bỏ dấu', () => {
    expect(
      receiverSuggestions({
        recent,
        warehouses,
        type: 'TRANSFER',
        currentSlug: 'wh-a',
        query: 'da nang',
      }),
    ).toEqual([{ kind: 'warehouse', value: 'Kho Đà Nẵng', code: 'DN', slug: 'wh-dn' }])
    expect(
      receiverSuggestions({
        recent,
        warehouses,
        type: 'TRANSFER',
        currentSlug: 'wh-a',
        query: 'hn',
      }),
    ).toEqual([{ kind: 'warehouse', value: 'Kho Hà Nội', code: 'HN', slug: 'wh-hn' }])
    expect(
      receiverSuggestions({ recent, warehouses, type: 'OTHER', currentSlug: 'wh-a', query: 'to' }),
    ).toEqual([{ kind: 'recent', value: 'Tổ hàn A' }])
  })

  it('đã gõ đúng y một gợi ý → không gợi ý lại chính nó', () => {
    expect(
      receiverSuggestions({
        recent,
        warehouses,
        type: 'TRANSFER',
        currentSlug: 'wh-a',
        query: 'Kho Hà Nội',
      }),
    ).toEqual([])
  })

  it('chưa gõ gì (query rỗng) mà ô đã có giá trị → đủ gợi ý, trừ chính giá trị đang có', () => {
    expect(
      receiverSuggestions({
        recent,
        warehouses,
        type: 'SALE',
        currentSlug: 'wh-a',
        query: '',
        current: 'Bếp B',
      }),
    ).toEqual([
      { kind: 'recent', value: 'kho hà nội' },
      { kind: 'recent', value: 'Tổ hàn A' },
    ])
  })
})
