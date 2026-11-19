import type { AvailableMaterial, AvailableUnit } from '@/entities/import-form'
import { effectiveSupplier, type ImportFormValues } from './import-form-editor.schema'

export type OverMaxWarning = {
  after: number
  max: number
  baseUnitCode: string
}

export type ReviewWarning =
  | { kind: 'zeroPrice'; index: number }
  | {
      kind: 'nonBaseUnit'
      index: number
      quantity: number
      unitCode: string
      baseQuantity: number
      baseUnitCode: string
    }
  | ({ kind: 'overMax'; index: number } & OverMaxWarning)

export type NewSupplierLink = { supplierSlug: string; materialSlugs: string[] }

function resolveBaseUnit(material: AvailableMaterial): AvailableUnit | undefined {
  return (
    material.units.find((u) => u.isBaseUnit) ??
    material.units.find((u) => u.unitSlug === material.baseUnitSlug)
  )
}

/**
 * Cộng dồn lượng nhập (quy về đơn vị gốc) của các dòng cùng vật tư rồi so với `effectiveMaximumInventory` (> 0).
 * Gắn cảnh báo vào dòng cuối của vật tư đó — dùng ở bước ② (`ImportFormItemsField.tsx`) ngay khi gõ số lượng.
 */
export function overMaxByLine(
  items: readonly { materialSlug: string; unitSlug: string; quantity?: number }[],
  materials: ReadonlyMap<string, AvailableMaterial>,
): ReadonlyMap<number, OverMaxWarning> {
  const baseTotals = new Map<string, { base: number; lastIndex: number }>()
  items.forEach((item, index) => {
    const material = materials.get(item.materialSlug)
    if (!material) return
    const unit = material.units.find((u) => u.unitSlug === item.unitSlug)
    const baseUnit = resolveBaseUnit(material)
    if (unit && baseUnit && typeof item.quantity === 'number' && item.quantity > 0) {
      const baseQuantity = item.quantity * unit.conversionRate
      const prev = baseTotals.get(material.slug)
      baseTotals.set(material.slug, { base: (prev?.base ?? 0) + baseQuantity, lastIndex: index })
    }
  })

  const result = new Map<number, OverMaxWarning>()
  for (const [slug, { base, lastIndex }] of baseTotals) {
    const material = materials.get(slug)
    const max = material?.effectiveMaximumInventory
    if (!material || max === undefined || max <= 0) continue
    const after = material.quantity + base
    if (after > max) {
      const baseUnit = resolveBaseUnit(material)
      result.set(lastIndex, {
        after,
        max,
        baseUnitCode: baseUnit?.unitCode ?? '',
      })
    }
  }
  return result
}

/** Cảnh báo mềm + liên kết NCC–vật tư mới cho hộp thoại Kiểm tra; không bao giờ chặn lưu. */
export function reviewImportForm(
  values: ImportFormValues,
  materials: ReadonlyMap<string, AvailableMaterial>,
): { warnings: ReviewWarning[]; newLinks: NewSupplierLink[]; supplierSlugs: string[] } {
  const warnings: ReviewWarning[] = []
  const suppliers: string[] = []
  const links = new Map<string, string[]>()

  values.items.forEach((item, index) => {
    if (item.unitPrice === 0) warnings.push({ kind: 'zeroPrice', index })

    // Bên bán gom TRƯỚC khi tra vật tư: vật tư ngoài map (vừa thêm từ hộp, ngoài 100 bản ghi đầu) vẫn được tính.
    const supplier = effectiveSupplier(values, index)
    if (supplier !== '' && !suppliers.includes(supplier)) suppliers.push(supplier)

    const material = materials.get(item.materialSlug)
    if (!material) return
    const unit = material.units.find((u) => u.unitSlug === item.unitSlug)
    const baseUnit = resolveBaseUnit(material)
    if (unit && baseUnit && typeof item.quantity === 'number') {
      const baseQuantity = item.quantity * unit.conversionRate
      if (unit.unitSlug !== baseUnit.unitSlug) {
        warnings.push({
          kind: 'nonBaseUnit',
          index,
          quantity: item.quantity,
          unitCode: unit.unitCode,
          baseQuantity,
          baseUnitCode: baseUnit.unitCode,
        })
      }
    }

    // Không biết NCC của vật tư ngoài map → không đoán liên kết mới cho nó.
    if (supplier !== '' && !material.suppliers.some((s) => s.slug === supplier)) {
      const list = links.get(supplier) ?? []
      if (!list.includes(material.slug)) list.push(material.slug)
      links.set(supplier, list)
    }
  })

  return {
    warnings,
    newLinks: [...links].map(([supplierSlug, materialSlugs]) => ({ supplierSlug, materialSlugs })),
    supplierSlugs: suppliers,
  }
}
