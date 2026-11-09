import type { AvailableMaterial } from '@/entities/import-form'

import { lineSupplier, newDraft, newLocalLine, restampSupplier, stampSupplier } from './add-line'
import { makeDraft, makeLine } from './fixtures'

const S1 = { slug: 's1', code: 'NCC1', name: 'Hoà Phát' }
const S2 = { slug: 's2', code: 'NCC2', name: 'Hà Tiên' }

const material = (over: Partial<AvailableMaterial> = {}): AvailableMaterial => ({
  slug: 'xi-mang',
  code: 'XM40',
  name: 'Xi măng PCB40',
  baseUnitSlug: 'kg',
  quantity: 1200,
  suppliers: [],
  units: [
    { unitSlug: 'kg', unitCode: 'KG', unitName: 'kg', conversionRate: 1, isBaseUnit: true },
    { unitSlug: 'bao', unitCode: 'BAO', unitName: 'bao', conversionRate: 50, isBaseUnit: false },
  ],
  ...over,
})

describe('lineSupplier', () => {
  it('vật tư có NCC đầu phiếu → NCC đầu phiếu', () => {
    expect(lineSupplier(material({ suppliers: [S1, S2] }), 's2')).toEqual(S2)
  })
  it('vật tư không có NCC đầu phiếu, chỉ có một NCC → NCC đó', () => {
    expect(lineSupplier(material({ suppliers: [S1] }), 's2')).toEqual(S1)
  })
  it('phiếu chưa có NCC, vật tư một NCC → NCC đó', () => {
    expect(lineSupplier(material({ suppliers: [S1] }), null)).toEqual(S1)
  })
  it('vật tư nhiều NCC, không có NCC đầu phiếu → null', () => {
    expect(lineSupplier(material({ suppliers: [S1, S2] }), 's9')).toBeNull()
    expect(lineSupplier(material({ suppliers: [S1, S2] }), null)).toBeNull()
  })
  it('vật tư không có NCC → null', () => {
    expect(lineSupplier(material(), 's1')).toBeNull()
  })
})

describe('newLocalLine', () => {
  it('dòng thêm trên máy: đã kiểm, base null, key theo vật tư + đơn vị, NCC theo luật', () => {
    const m = material({ suppliers: [S1, S2] })
    const line = newLocalLine({
      material: m,
      unit: m.units[1],
      quantity: 12.5,
      unitPrice: 0,
      headerSupplier: 's1',
    })
    expect(line).toEqual({
      key: 'xi-mang|bao',
      materialSlug: 'xi-mang',
      unitSlug: 'bao',
      materialCode: 'XM40',
      materialName: 'Xi măng PCB40',
      unitName: 'bao',
      unitPrice: 0,
      supplierSlug: 's1',
      supplierName: 'Hoà Phát',
      base: null,
      quantity: 12.5,
      expiryDate: null,
      note: null,
      checked: true,
      changedOnServer: false,
    })
  })
})

describe('newLocalLine — phiếu tạo trên máy có bên bán đầu phiếu', () => {
  it('vật tư KHÔNG có NCC đầu phiếu → vẫn lấy NCC đầu phiếu (một phiếu một bên bán)', () => {
    const m = material({ suppliers: [S1] })
    const line = newLocalLine({
      material: m,
      unit: m.units[0],
      quantity: 1,
      unitPrice: 0,
      headerSupplier: 's9',
      fixedSupplier: { slug: 's9', name: 'Bên bán mới' },
    })
    expect(line).toMatchObject({ supplierSlug: 's9', supplierName: 'Bên bán mới' })
  })
})

describe('stampSupplier', () => {
  it('ghi NCC mới lên mọi dòng', () => {
    const lines = [makeLine(1, { supplierSlug: 's1', supplierName: 'A' }), makeLine(2)]
    expect(
      stampSupplier(lines, { slug: 's2', name: 'B' }).map((l) => [l.supplierSlug, l.supplierName]),
    ).toEqual([
      ['s2', 'B'],
      ['s2', 'B'],
    ])
  })
})

describe('restampSupplier', () => {
  const draftWith = (supplierSlug: string | null) =>
    makeDraft([makeLine(1, { supplierSlug: 's1', supplierName: 'A' }), makeLine(2)], {
      formSlug: 'new',
      header: { ...makeDraft([]).header, supplierSlug },
    })

  it('đổi bên bán đầu phiếu: ghi lại header và mọi dòng', () => {
    const next = restampSupplier(draftWith('s1'), { slug: 's2', name: 'B' })
    expect(next.header.supplierSlug).toBe('s2')
    expect(next.lines.map((l) => [l.supplierSlug, l.supplierName])).toEqual([
      ['s2', 'B'],
      ['s2', 'B'],
    ])
  })

  it('lần đầu chọn bên bán (đầu phiếu chưa có): cũng ghi lên mọi dòng', () => {
    const next = restampSupplier(draftWith(null), { slug: 's2', name: 'B' })
    expect(next.header.supplierSlug).toBe('s2')
    expect(next.lines.every((l) => l.supplierSlug === 's2')).toBe(true)
  })

  it('chọn lại đúng bên bán hiện tại hoặc không có bên bán: không đổi gì', () => {
    const d = draftWith('s1')
    expect(restampSupplier(d, { slug: 's1', name: 'A' })).toBe(d)
    expect(restampSupplier(d, null)).toBe(d)
  })
})

describe('newDraft', () => {
  it("phiếu 'new': chưa có version, chưa có dòng, header đúng", () => {
    const header = {
      code: 'PN-20261104-0930',
      invoiceCode: 'HD-1',
      date: '2026-11-04',
      purchaseOrder: null,
      note: null,
      supplierSlug: 's1',
    }
    const d = newDraft(header)
    expect(d).toMatchObject({ formSlug: 'new', version: null, header, lines: [] })
    expect(typeof d.savedAt).toBe('number')
  })
})
