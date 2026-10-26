import type { ExportForm, ExportFormItem } from './types'

/** Dữ liệu giả dùng chung cho test các tầng trên. KHÔNG export qua `index.ts`. */
export function exportFormItemFixture(overrides: Partial<ExportFormItem> = {}): ExportFormItem {
  return {
    slug: 'xit-1',
    createdAt: '2026-10-26T02:00:00.000Z',
    updatedAt: '2026-10-26T02:00:00.000Z',
    lineNo: 1,
    materialSlug: 'm-flour',
    materialCode: 'VT-01',
    materialName: 'Bột mì',
    unitSlug: 'u-kg',
    unitCode: 'KG',
    unitName: 'Kilogram',
    batchSlug: null,
    batchExpiryDate: null,
    quantity: 10,
    conversionRate: 1,
    baseQuantity: 10,
    unitPrice: 20_000,
    amount: 200_000,
    note: null,
    ...overrides,
  }
}

export function exportFormFixture(overrides: Partial<ExportForm> = {}): ExportForm {
  return {
    slug: 'xf-1',
    createdAt: '2026-10-26T02:00:00.000Z',
    updatedAt: '2026-10-26T02:00:00.000Z',
    version: 3,
    code: 'PX-0001',
    type: 'SALE',
    status: 'DRAFT',
    purchaseOrder: 'PO-12',
    invoiceCode: 'HD-123',
    requesterSlug: 'u-req',
    requesterName: 'Nguyễn Văn A',
    approverSlug: null,
    approverName: null,
    receiver: 'Cửa hàng B',
    totalAmount: 200_000,
    note: null,
    file: null,
    warehouseSlug: 'w-a',
    items: [exportFormItemFixture()],
    ...overrides,
  }
}
