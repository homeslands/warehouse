import { describe, expect, it } from 'vitest'
import { formatWarehouseReceiver, parseWarehouseReceiver } from './receiver'

const warehouses = [
  { slug: 'w-b', code: 'KHO-B', name: 'Kho Bình Dương' },
  { slug: 'w-c', code: 'KHO-C', name: 'Kho Cần Thơ' },
]

describe('receiver', () => {
  it('format ra "Kho: <mã> · <tên>"', () => {
    expect(formatWarehouseReceiver(warehouses[0])).toBe('Kho: KHO-B · Kho Bình Dương')
  })

  it('parse khớp trả slug kho', () => {
    expect(parseWarehouseReceiver('Kho: KHO-C · Kho Cần Thơ', warehouses)).toBe('w-c')
  })

  it('chữ tự do → null', () => {
    expect(parseWarehouseReceiver('Cửa hàng B', warehouses)).toBeNull()
  })

  it('kho không có trong danh sách → null', () => {
    expect(parseWarehouseReceiver('Kho: KHO-Z · Kho Z', warehouses)).toBeNull()
  })
})
