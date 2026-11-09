import type { ImportForm, ImportFormItem } from '@/entities/import-form'
import type { LineBase, LocalLine, ReceiveDraft } from './draft'

/** Dữ liệu dựng sẵn cho test của slice (không dùng ở code chạy thật). */
export function makeItem(n: number, over: Partial<ImportFormItem> = {}): ImportFormItem {
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
    unitName: 'bao',
    supplierSlug: null,
    supplierCode: null,
    supplierName: null,
    supplierTaxCode: null,
    supplierAddress: null,
    quantity: 10,
    conversionRate: 1,
    baseQuantity: 10,
    unitPrice: 1000,
    amount: 10000,
    note: null,
    expiryDate: null,
    ...over,
  }
}

export function makeForm(items: ImportFormItem[], over: Partial<ImportForm> = {}): ImportForm {
  return {
    slug: 'pn-1',
    version: 3,
    createdAt: '2026-11-04T00:00:00Z',
    updatedAt: '2026-11-04T00:00:00Z',
    code: 'PN-1',
    purchaseOrder: null,
    invoiceCode: 'HD-1',
    requesterSlug: 'u',
    requesterName: 'U',
    approverSlug: null,
    approverName: null,
    date: '2026-11-04',
    total: 0,
    file: null,
    note: null,
    status: 'DRAFT',
    warehouseSlug: 'kho',
    items,
    ...over,
  } as ImportForm
}

/**
 * Dòng mẫu. `base` nhận một phần (thiếu trường lấy mặc định: số 10, đơn vị / đơn giá của dòng); `null`
 * = dòng thêm trên máy.
 */
export function makeLine(
  n: number,
  { base, ...over }: Omit<Partial<LocalLine>, 'base'> & { base?: Partial<LineBase> | null } = {},
): LocalLine {
  return {
    key: `m-${n}|u-${n}`,
    materialSlug: `m-${n}`,
    unitSlug: `u-${n}`,
    materialCode: `VT${n}`,
    materialName: `Vật tư ${n}`,
    unitName: 'bao',
    unitPrice: 1000,
    supplierSlug: null,
    supplierName: null,
    base:
      base === null
        ? null
        : {
            unitSlug: over.unitSlug ?? `u-${n}`,
            quantity: 10,
            unitPrice: over.unitPrice ?? 1000,
            expiryDate: null,
            note: null,
            ...base,
          },
    quantity: 10,
    expiryDate: null,
    note: null,
    checked: false,
    changedOnServer: false,
    ...over,
  }
}

/** Bản nháp mẫu; `headerBase` mặc định = `header` (đầu phiếu chưa sửa). */
export function makeDraft(lines: LocalLine[], over: Partial<ReceiveDraft> = {}): ReceiveDraft {
  const header = over.header ?? {
    code: 'PN-1',
    invoiceCode: 'HD-1',
    date: '2026-11-04',
    purchaseOrder: null,
    note: null,
    supplierSlug: null,
    file: null,
  }
  return {
    formSlug: 'pn-1',
    version: 3,
    header,
    headerBase: header,
    lines,
    savedAt: 0,
    ...over,
  }
}
