/**
 * NCC xuất hiện nhiều nhất ở các dòng; hoà → NCC xuất hiện trước; không dòng nào có NCC → `null`.
 * Chép thuật toán web `features/import-form-editor/model/supplier.ts` (web trả `''`, mobile `null`).
 */
export function deriveHeaderSupplier(slugs: (string | null)[]): string | null {
  const counts = new Map<string, number>()
  for (const slug of slugs) {
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }
  let best: string | null = null
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
