import { isReceiverValidFor, receiverChoices } from './receiver-suggestions'

const W = (slug: string, name: string, code = slug.toUpperCase()) => ({
  slug,
  code,
  name,
  isManager: false,
})
const warehouses = [
  W('wh-a', 'Kho Tổng', 'A'),
  W('wh-hn', 'Kho Hà Nội', 'HN'),
  W('wh-dn', 'Kho Đà Nẵng', 'DN'),
]

describe('receiverChoices', () => {
  it('Chuyển kho: các kho trừ kho hiện tại; nhãn "Tên (MÃ)", value = tên kho, selected theo giá trị hiện tại', () => {
    const opts = { warehouses, currentSlug: 'wh-a', recent: ['Bếp B'], value: 'Kho Đà Nẵng' }
    expect(receiverChoices('TRANSFER', opts)).toEqual([
      { label: 'Kho Hà Nội (HN)', value: 'Kho Hà Nội', selected: false },
      { label: 'Kho Đà Nẵng (DN)', value: 'Kho Đà Nẵng', selected: true },
    ])
  })

  it('Chuyển kho: giá trị gõ tay không phải kho đứng đầu, selected', () => {
    const out = receiverChoices('TRANSFER', {
      warehouses,
      currentSlug: 'wh-a',
      recent: [],
      value: 'Kho tàu',
    })
    expect(out.map((c) => [c.value, c.selected])).toEqual([
      ['Kho tàu', true],
      ['Kho Hà Nội', false],
      ['Kho Đà Nẵng', false],
    ])
  })

  it('loại khác: tối đa 8 người nhận gần đây (không có kho)', () => {
    const recent = Array.from({ length: 10 }, (_, i) => `Người ${i}`)
    const out = receiverChoices('SALE', { warehouses, currentSlug: 'wh-a', recent, value: '' })
    expect(out).toHaveLength(8)
    expect(out[0]).toEqual({ label: 'Người 0', value: 'Người 0', selected: false })
  })

  it('giá trị gõ tay không có trong danh sách → đứng đầu, selected', () => {
    const out = receiverChoices('SALE', {
      warehouses,
      currentSlug: 'wh-a',
      recent: ['Bếp B', 'Tổ A'],
      value: 'Anh Nam',
    })
    expect(out.map((c) => [c.value, c.selected])).toEqual([
      ['Anh Nam', true],
      ['Bếp B', false],
      ['Tổ A', false],
    ])
  })

  it('giá trị đã có trong gần đây → đánh dấu tại chỗ, không nhân đôi', () => {
    const out = receiverChoices('OTHER', {
      warehouses,
      currentSlug: 'wh-a',
      recent: ['Bếp B', 'Tổ A'],
      value: 'tổ a',
    })
    expect(out.map((c) => [c.value, c.selected])).toEqual([
      ['Bếp B', false],
      ['Tổ A', true],
    ])
  })
})

describe('isReceiverValidFor', () => {
  it('cùng kiểu (cả hai không phải Chuyển kho): luôn giữ, kể cả tên kho', () => {
    expect(isReceiverValidFor('SALE', 'PRODUCTION', 'Kho Hà Nội', warehouses)).toBe(true)
  })
  it('→ Chuyển kho: chỉ chuỗi khớp một kho', () => {
    expect(isReceiverValidFor('SALE', 'TRANSFER', 'Kho Hà Nội', warehouses)).toBe(true)
    expect(isReceiverValidFor('SALE', 'TRANSFER', 'Anh Nam', warehouses)).toBe(false)
    expect(isReceiverValidFor('SALE', 'TRANSFER', '', warehouses)).toBe(false)
  })
  it('Chuyển kho → khác: bỏ khi là tên kho, giữ tên gõ tay', () => {
    expect(isReceiverValidFor('TRANSFER', 'SALE', 'Kho Hà Nội', warehouses)).toBe(false)
    expect(isReceiverValidFor('TRANSFER', 'SALE', 'Anh Nam', warehouses)).toBe(true)
    expect(isReceiverValidFor('TRANSFER', 'SALE', '', warehouses)).toBe(true)
  })
})
