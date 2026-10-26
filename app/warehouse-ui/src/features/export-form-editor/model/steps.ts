import type { ExportFormValues } from './export-form-editor.schema'

export type ExportFormStepStatus = {
  /** ① xong: có lý do xuất, người nhận và số PO. */
  infoDone: boolean
  /** ② xong: có ít nhất một dòng đủ. */
  itemsDone: boolean
  /** Dòng có vật tư, đơn vị, số lượng > 0 (và đơn giá ≥ 0 khi Bán) — hiện cạnh bước ②. */
  lineCount: number
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Trạng thái của dải bước — chỉ để định hướng, không thay cho validate của schema. */
export function exportFormStepStatus(
  values: Pick<ExportFormValues, 'type' | 'receiver' | 'purchaseOrder' | 'items'>,
  { sale }: { sale: boolean },
): ExportFormStepStatus {
  const infoDone =
    Boolean(values.type) &&
    (values.receiver ?? '').trim() !== '' &&
    (values.purchaseOrder ?? '').trim() !== ''
  const lineCount = (values.items ?? []).filter(
    (item) =>
      Boolean(item.materialSlug) &&
      Boolean(item.unitSlug) &&
      isNumber(item.quantity) &&
      item.quantity > 0 &&
      (!sale || (isNumber(item.unitPrice) && item.unitPrice >= 0)),
  ).length
  return { infoDone, itemsDone: lineCount > 0, lineCount }
}
