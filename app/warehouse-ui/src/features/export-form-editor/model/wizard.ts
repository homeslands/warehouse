import type { FieldErrors, FieldPath } from 'react-hook-form'
import {
  firstErrorField as findFirstErrorField,
  firstStepWithError as findFirstStepWithError,
} from '@/shared/lib/wizard-errors'
import type { ExportFormValues } from './export-form-editor.schema'

/** Ba bước của sheet phiếu xuất, theo thứ tự hiển thị. */
export const WIZARD_STEPS = ['info', 'items', 'review'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

/** Các ô của bước ①, đúng thứ tự trên màn hình — `firstErrorField` lấy ô lỗi đầu tiên theo thứ tự này. */
const INFO_FIELDS: FieldPath<ExportFormValues>[] = [
  'type',
  'receiver',
  'purchaseOrder',
  'invoiceCode',
  'file',
  'note',
  'code',
]

/** Các ô của một dòng vật tư, theo thứ tự hiển thị trong lưới. */
const ITEM_ROW_FIELDS = ['materialSlug', 'batchSlug', 'quantity', 'unitSlug', 'unitPrice'] as const

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step)
}

/** Các ô (đường dẫn RHF) thuộc bước. `review` không có ô nhập. */
export function stepFields(step: WizardStep): FieldPath<ExportFormValues>[] {
  switch (step) {
    case 'info':
      return [...INFO_FIELDS]
    case 'items':
      return ['items']
    case 'review':
      return []
  }
}

/** Bước chứa ô có đường dẫn `path`: mọi thứ bắt đầu bằng `items` thuộc bước ②, còn lại là ①. */
export function stepOfField(path: string): WizardStep {
  return path === 'items' || path.startsWith('items.') ? 'items' : 'info'
}

/** Bước sớm nhất (theo `WIZARD_STEPS`) có ít nhất một lỗi; `null` nếu không có lỗi nào. */
export function firstStepWithError(errors: FieldErrors<ExportFormValues>): WizardStep | null {
  return findFirstStepWithError(errors, WIZARD_STEPS, stepFields)
}

/** Ô lỗi đầu tiên của bước (với `items`: dòng lỗi nhỏ nhất, rồi ô đầu tiên theo `ITEM_ROW_FIELDS`). */
export function firstErrorField(
  errors: FieldErrors<ExportFormValues>,
  step: WizardStep,
): FieldPath<ExportFormValues> | null {
  return findFirstErrorField(errors, step, {
    stepFields,
    rowsStep: 'items',
    rowsKey: 'items',
    rowFields: ITEM_ROW_FIELDS,
  })
}
