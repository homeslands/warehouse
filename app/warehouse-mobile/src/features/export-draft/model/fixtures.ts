import type { ExportForm, ExportFormItem } from '@/entities/export-form'

import { exportLineKey, type ExportDraft, type ExportLine } from './draft'

/** Dữ liệu dựng sẵn cho test của slice (không dùng ở code chạy thật). */
export function makeItem(n: number, over: Partial<ExportFormItem> = {}): ExportFormItem {
  return {
    slug: `it-${n}`,
    createdAt: '2026-11-04T00:00:00Z',
    updatedAt: '2026-11-04T00:00:00Z',
    lineNo: n,
    materialSlug: `m-${n}`,
    materialCode: `VT${n}`,
    materialName: `Vật tư ${n}`,
    unitSlug: `u-${n}`,
    unitCode: 'U',
    unitName: 'hộp',
    batchSlug: null,
    batchExpiryDate: null,
    quantity: 10,
    conversionRate: 1,
    baseQuantity: 10,
    unitPrice: 1000,
    amount: 10000,
    note: null,
    ...over,
  }
}

export function makeForm(items: ExportFormItem[], over: Partial<ExportForm> = {}): ExportForm {
  return {
    slug: 'px-1',
    version: 3,
    createdAt: '2026-11-04T00:00:00Z',
    updatedAt: '2026-11-04T00:00:00Z',
    code: 'PX-1',
    type: 'PRODUCTION',
    status: 'DRAFT',
    purchaseOrder: 'PO-1',
    invoiceCode: 'HD-1',
    requesterSlug: 'u',
    requesterName: 'U',
    approverSlug: null,
    approverName: null,
    receiver: 'Bếp A',
    totalAmount: 0,
    note: null,
    file: null,
    warehouseSlug: 'kho',
    items,
    ...over,
  }
}

export function makeLine(n: number, over: Partial<ExportLine> = {}): ExportLine {
  const line: ExportLine = {
    key: '',
    materialSlug: `m-${n}`,
    materialCode: `VT${n}`,
    materialName: `Vật tư ${n}`,
    unitSlug: `u-${n}`,
    unitName: 'hộp',
    conversionRate: 1,
    quantity: 10,
    unitPrice: 1000,
    batchSlug: null,
    batchExpiryDate: null,
    note: null,
    base: { unitSlug: `u-${n}`, quantity: 10, unitPrice: 1000, batchSlug: null, note: null },
    ...over,
  }
  return { ...line, key: over.key ?? exportLineKey(line) }
}

export function makeDraft(lines: ExportLine[], over: Partial<ExportDraft> = {}): ExportDraft {
  const header: ExportDraft['header'] = {
    code: 'PX-1',
    type: 'PRODUCTION',
    purchaseOrder: 'PO-1',
    invoiceCode: 'HD-1',
    receiver: 'Bếp A',
    note: null,
    file: null,
  }
  return { version: 3, header, headerBase: header, lines, ...over }
}
