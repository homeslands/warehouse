/**
 * Nhóm vật tư theo bên bán (ô xổ vật tư của dòng và hộp "Chọn vật tư"): `usual` = hàng thường mua của `supplierSlug`,
 * `rest` = còn lại, giữ thứ tự nguồn. Không có bên bán → mọi vật tư ở `rest`.
 */
export function splitBySupplier<T extends { suppliers: { slug: string }[] }>(
  source: T[],
  supplierSlug: string,
): { usual: T[]; rest: T[] } {
  if (!supplierSlug) return { usual: [], rest: source }
  const usual = source.filter((m) => m.suppliers.some((x) => x.slug === supplierSlug))
  return { usual, rest: source.filter((m) => !usual.includes(m)) }
}
