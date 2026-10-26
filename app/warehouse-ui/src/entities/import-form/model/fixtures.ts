import type { AvailableMaterial, ImportForm } from './types'

/** Dữ liệu giả dùng chung cho test các tầng trên. KHÔNG export qua `index.ts`. */
export const flour: AvailableMaterial = {
  slug: 'm-flour',
  code: 'VT-01',
  name: 'Bột mì',
  baseUnitSlug: 'u-kg',
  quantity: 120,
  suppliers: [{ slug: 's-1', code: 'NCC-01', name: 'NCC Bột' }],
  units: [
    { unitSlug: 'u-kg', unitCode: 'KG', unitName: 'Kilogram', conversionRate: 1, isBaseUnit: true },
    {
      unitSlug: 'u-bag',
      unitCode: 'BAG',
      unitName: 'Bao 25kg',
      conversionRate: 25,
      isBaseUnit: false,
    },
  ],
}

export const sugar: AvailableMaterial = {
  slug: 'm-sugar',
  code: 'VT-02',
  name: 'Đường',
  baseUnitSlug: 'u-kg',
  quantity: 0,
  suppliers: [],
  units: [
    { unitSlug: 'u-kg', unitCode: 'KG', unitName: 'Kilogram', conversionRate: 1, isBaseUnit: true },
  ],
}

export const draftForm: ImportForm = {
  slug: 'if-1',
  createdAt: '2026-10-12T02:00:00.000Z',
  updatedAt: '2026-10-12T02:00:00.000Z',
  version: 3,
  code: 'PN-0001',
  purchaseOrder: 'PO-12',
  invoiceCode: 'HD-123',
  requesterSlug: 'u-sup',
  requesterName: 'Nguyễn Văn A',
  approverSlug: null,
  approverName: null,
  date: '2026-10-12',
  total: 3_750_000,
  file: 'hoa-don-1760000000000.pdf',
  note: 'Giao buổi sáng',
  status: 'DRAFT',
  warehouseSlug: 'w-a',
  items: [
    {
      slug: 'it-1',
      createdAt: '',
      updatedAt: '',
      lineNo: 1,
      materialSlug: 'm-flour',
      materialCode: 'VT-01',
      materialName: 'Bột mì',
      unitSlug: 'u-bag',
      unitCode: 'BAG',
      unitName: 'Bao 25kg',
      supplierSlug: 's-1',
      supplierCode: 'NCC-01',
      supplierName: 'NCC Bột',
      supplierTaxCode: '0101',
      supplierAddress: 'Hà Nội',
      quantity: 10,
      conversionRate: 25,
      baseQuantity: 250,
      unitPrice: 375_000,
      amount: 3_750_000,
      expiryDate: null,
      note: null,
    },
  ],
}
