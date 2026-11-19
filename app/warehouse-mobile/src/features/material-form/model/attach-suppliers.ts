import { attachMaterialToSupplier } from '@/entities/import-form'

export type AttachSuppliersResult = {
  ok: string[]
  failed: { slug: string; error: unknown }[]
  stale: boolean
}

/**
 * Gắn vật tư vừa tạo vào lần lượt từng bên bán (tuần tự, đúng thứ tự truyền vào). Lỗi một bên bán không dừng
 * các bên sau. `isStale()` (phiên đổi) kiểm trước và sau mỗi lần gọi → dừng, `stale`.
 */
export async function attachToSuppliers(
  materialSlug: string,
  supplierSlugs: readonly string[],
  isStale: () => boolean,
): Promise<AttachSuppliersResult> {
  const result: AttachSuppliersResult = { ok: [], failed: [], stale: false }
  for (const slug of supplierSlugs) {
    if (isStale()) return { ...result, stale: true }
    try {
      await attachMaterialToSupplier(slug, materialSlug)
      if (isStale()) return { ...result, stale: true }
      result.ok.push(slug)
    } catch (error) {
      if (isStale()) return { ...result, stale: true }
      result.failed.push({ slug, error })
    }
  }
  return result
}
