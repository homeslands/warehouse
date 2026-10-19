import type { ImportFormValues } from './import-form-editor.schema'

export type ImportFormStepStatus = {
  /** ① xong: có số hoá đơn, và có bên bán khi người dùng chọn được NCC. */
  sellerDone: boolean
  /** ② xong: có ít nhất một dòng đủ vật tư, đơn vị, số lượng > 0 và đơn giá ≥ 0. */
  itemsDone: boolean
  /** Số dòng đủ như trên — hiện cạnh bước ②. */
  lineCount: number
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Trạng thái của dải bước — chỉ để định hướng, không thay cho validate của schema. */
export function importFormStepStatus(
  values: Pick<ImportFormValues, 'supplierSlug' | 'invoiceCode' | 'items'>,
  { requireSupplier }: { requireSupplier: boolean },
): ImportFormStepStatus {
  const sellerDone =
    (values.invoiceCode ?? '').trim() !== '' && (!requireSupplier || Boolean(values.supplierSlug))
  const lineCount = (values.items ?? []).filter(
    (item) =>
      Boolean(item.materialSlug) &&
      Boolean(item.unitSlug) &&
      isNumber(item.quantity) &&
      item.quantity > 0 &&
      isNumber(item.unitPrice) &&
      item.unitPrice >= 0,
  ).length
  return { sellerDone, itemsDone: lineCount > 0, lineCount }
}
