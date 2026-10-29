import type { FieldErrors, FieldPath } from 'react-hook-form'
import type { ImportFormValues } from './import-form-editor.schema'

/** Ba bước của sheet phiếu nhập, theo thứ tự hiển thị. */
export const WIZARD_STEPS = ['info', 'items', 'review'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

/** Các ô của bước ①, đúng thứ tự trên màn hình — `firstErrorField` lấy ô lỗi đầu tiên theo thứ tự này. */
const INFO_FIELDS: FieldPath<ImportFormValues>[] = [
  'supplierSlug',
  'invoiceCode',
  'date',
  'file',
  'purchaseOrder',
  'note',
  'code',
]

/** Các ô của một dòng vật tư, theo thứ tự hiển thị trong lưới. */
const ITEM_ROW_FIELDS = ['materialSlug', 'unitSlug', 'quantity', 'unitPrice'] as const

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step)
}

/** Các ô (đường dẫn RHF) thuộc bước. `review` không có ô nhập. */
export function stepFields(step: WizardStep): FieldPath<ImportFormValues>[] {
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

type LooseErrors = Record<string, unknown>

/** Một khoá lỗi có thật: không undefined, và với mảng dòng thì phải có ít nhất một phần tử lỗi. */
function hasError(value: unknown): boolean {
  if (!value) return false
  if (Array.isArray(value)) {
    // RHF gắn lỗi cấp mảng vào `root` / `message` trên chính mảng, kể cả khi không dòng nào lỗi.
    const arrayLevel = value as unknown as LooseErrors
    if (arrayLevel.root || arrayLevel.message) return true
    return value.some((entry) => entry !== undefined && entry !== null)
  }
  return true
}

function stepHasError(errors: LooseErrors, step: WizardStep): boolean {
  return stepFields(step).some((field) => hasError(errors[field]))
}

/** Bước sớm nhất (theo `WIZARD_STEPS`) có ít nhất một lỗi; `null` nếu không có lỗi nào. */
export function firstStepWithError(errors: FieldErrors<ImportFormValues>): WizardStep | null {
  const loose = errors as LooseErrors
  return WIZARD_STEPS.find((step) => stepHasError(loose, step)) ?? null
}

/**
 * Ô lỗi đầu tiên của bước. Với `items`: dòng lỗi nhỏ nhất, rồi ô đầu tiên của dòng đó trong
 * `ITEM_ROW_FIELDS`. Lỗi cấp mảng (`items.root`) chỉ là phương án cuối khi không dòng nào có ô lỗi.
 */
export function firstErrorField(
  errors: FieldErrors<ImportFormValues>,
  step: WizardStep,
): FieldPath<ImportFormValues> | null {
  const loose = errors as LooseErrors
  if (step === 'items') {
    const rows = loose.items
    if (Array.isArray(rows)) {
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index] as LooseErrors | undefined
        if (!row) continue
        const field = ITEM_ROW_FIELDS.find((key) => hasError(row[key]))
        if (field) return `items.${index}.${field}` as FieldPath<ImportFormValues>
      }
    }
    return hasError(rows) ? 'items' : null
  }
  return stepFields(step).find((field) => hasError(loose[field])) ?? null
}
