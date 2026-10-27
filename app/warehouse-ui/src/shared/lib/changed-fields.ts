function hasDirty(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasDirty)
  if (value !== null && typeof value === 'object') return Object.values(value).some(hasDirty)
  return Boolean(value)
}

/**
 * Nhãn của các ô đã sửa, theo thứ tự `labels`. `dirtyFields` là `formState.dirtyFields` của
 * react-hook-form (boolean, hoặc object / mảng lồng nhau); khoá không có nhãn bị bỏ.
 */
export function changedFieldLabels(
  dirtyFields: Record<string, unknown>,
  labels: Record<string, string>,
): string[] {
  return Object.keys(labels)
    .filter((key) => hasDirty(dirtyFields[key]))
    .map((key) => labels[key])
}
