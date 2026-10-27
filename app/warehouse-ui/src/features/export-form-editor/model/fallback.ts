import type { ExportForm } from '@/entities/export-form'

/** Nhãn + đơn vị đã lưu của vật tư trên phiếu nháp — dùng khi vật tư không có trong danh sách tồn đã tải. */
export type FallbackMaterial = {
  code: string
  name: string
  units: { unitSlug: string; unitCode: string; unitName: string }[]
}

/**
 * Vật tư của các dòng phiếu (theo slug) với mã / tên và các đơn vị đã lưu (snapshot lúc ghi dòng). Danh sách tồn của
 * form chỉ có 500 vật tư đầu và không có vật tư đã gỡ khỏi kho — dòng nháp vẫn phải hiện đúng tên và sửa được.
 */
export function fallbackMaterialsOf(
  items: ExportForm['items'] = [],
): ReadonlyMap<string, FallbackMaterial> {
  const map = new Map<string, FallbackMaterial>()
  for (const i of items) {
    const entry = map.get(i.materialSlug) ?? {
      code: i.materialCode,
      name: i.materialName,
      units: [],
    }
    if (!entry.units.some((u) => u.unitSlug === i.unitSlug))
      entry.units.push({ unitSlug: i.unitSlug, unitCode: i.unitCode, unitName: i.unitName })
    map.set(i.materialSlug, entry)
  }
  return map
}
