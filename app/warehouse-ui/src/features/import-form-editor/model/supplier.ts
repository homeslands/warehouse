import type { ImportFormValues } from './import-form-editor.schema'

/** NCC xuất hiện nhiều nhất ở các dòng; hoà → dòng đầu có NCC; không dòng nào có NCC → `''`. */
export function deriveHeaderSupplier(lineSuppliers: (string | null)[]): string {
  const counts = new Map<string, number>()
  for (const slug of lineSuppliers) {
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }
  let best = ''
  let bestCount = 0
  // Map giữ thứ tự chèn nên `>` nghiêm ngặt giữ NCC xuất hiện trước khi hoà.
  for (const [slug, count] of counts) {
    if (count > bestCount) {
      best = slug
      bestCount = count
    }
  }
  return best
}

/** Số dòng đã chọn vật tư và đang theo đầu phiếu (không có ghi đè riêng). */
export function countFollowingLines(values: ImportFormValues): number {
  return values.items.filter((i) => i.materialSlug !== '' && i.supplierOverride === '').length
}
