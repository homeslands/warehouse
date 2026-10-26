import type { FieldErrors, FieldPath, FieldValues } from 'react-hook-form'

type LooseErrors = Record<string, unknown>

/** Một khoá lỗi có thật: không undefined, và với mảng dòng thì phải có ít nhất một phần tử lỗi. */
export function hasError(value: unknown): boolean {
  if (!value) return false
  if (Array.isArray(value)) {
    // RHF gắn lỗi cấp mảng vào `root` / `message` trên chính mảng, kể cả khi không dòng nào lỗi.
    const arrayLevel = value as unknown as LooseErrors
    if (arrayLevel.root || arrayLevel.message) return true
    return value.some((entry) => entry !== undefined && entry !== null)
  }
  return true
}

/** Bước sớm nhất (theo thứ tự `steps`) có ít nhất một ô lỗi; `null` nếu không có lỗi nào. */
export function firstStepWithError<T extends FieldValues, S extends string>(
  errors: FieldErrors<T>,
  steps: readonly S[],
  stepFields: (step: S) => FieldPath<T>[],
): S | null {
  const loose = errors as LooseErrors
  return steps.find((step) => stepFields(step).some((field) => hasError(loose[field]))) ?? null
}

export type FirstErrorFieldConfig<T extends FieldValues, S extends string> = {
  stepFields: (step: S) => FieldPath<T>[]
  /** Bước chứa lưới dòng. */
  rowsStep: S
  /** Tên mảng dòng trong form, ví dụ `'items'`. */
  rowsKey: string
  /** Ô của một dòng theo thứ tự hiển thị. */
  rowFields: readonly string[]
}

/**
 * Ô lỗi đầu tiên của bước. Với bước lưới dòng: dòng lỗi nhỏ nhất, rồi ô đầu tiên của dòng đó theo `rowFields`.
 * Lỗi cấp mảng chỉ là phương án cuối khi không dòng nào có ô lỗi.
 */
export function firstErrorField<T extends FieldValues, S extends string>(
  errors: FieldErrors<T>,
  step: S,
  config: FirstErrorFieldConfig<T, S>,
): FieldPath<T> | null {
  const loose = errors as LooseErrors
  if (step === config.rowsStep) {
    const rows = loose[config.rowsKey]
    if (Array.isArray(rows)) {
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index] as LooseErrors | undefined
        if (!row) continue
        const field = config.rowFields.find((key) => hasError(row[key]))
        if (field) return `${config.rowsKey}.${index}.${field}` as FieldPath<T>
      }
    }
    return hasError(rows) ? (config.rowsKey as FieldPath<T>) : null
  }
  return config.stepFields(step).find((field) => hasError(loose[field])) ?? null
}
