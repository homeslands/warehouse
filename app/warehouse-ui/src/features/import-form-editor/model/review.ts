import type { AvailableMaterial } from '@/entities/import-form'
import { effectiveSupplier, type ImportFormValues } from './import-form-editor.schema'

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
  | { kind: 'overMax'; index: number; after: number; max: number; baseUnitCode: string }

export type NewSupplierLink = { supplierSlug: string; materialSlugs: string[] }

/** Cảnh báo mềm + liên kết NCC–vật tư mới cho hộp thoại Kiểm tra; không bao giờ chặn lưu. */
export function reviewImportForm(
  values: ImportFormValues,
  materials: ReadonlyMap<string, AvailableMaterial>,
): { warnings: ReviewWarning[]; newLinks: NewSupplierLink[]; supplierSlugs: string[] } {
  const warnings: ReviewWarning[] = []
  const suppliers: string[] = []
  const links = new Map<string, string[]>()
  const baseTotals = new Map<string, { base: number; lastIndex: number }>()

  values.items.forEach((item, index) => {
    if (item.unitPrice === 0) warnings.push({ kind: 'zeroPrice', index })

    // Bên bán gom TRƯỚC khi tra vật tư: vật tư ngoài map (vừa thêm từ hộp, ngoài 100 bản ghi đầu) vẫn được tính.
    const supplier = effectiveSupplier(values, index)
    if (supplier !== '' && !suppliers.includes(supplier)) suppliers.push(supplier)

    const material = materials.get(item.materialSlug)
    if (!material) return
    const unit = material.units.find((u) => u.unitSlug === item.unitSlug)
    const baseUnit =
      material.units.find((u) => u.isBaseUnit) ??
      material.units.find((u) => u.unitSlug === material.baseUnitSlug)
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
      const prev = baseTotals.get(material.slug)
      baseTotals.set(material.slug, { base: (prev?.base ?? 0) + baseQuantity, lastIndex: index })
    }

    // Không biết NCC của vật tư ngoài map → không đoán liên kết mới cho nó.
    if (supplier !== '' && !material.suppliers.some((s) => s.slug === supplier)) {
      const list = links.get(supplier) ?? []
      if (!list.includes(material.slug)) list.push(material.slug)
      links.set(supplier, list)
    }
  })

  for (const [slug, { base, lastIndex }] of baseTotals) {
    const material = materials.get(slug)
    const max = material?.effectiveMaximumInventory
    if (!material || max === undefined) continue
    const after = material.quantity + base
    if (after > max) {
      const baseUnit =
        material.units.find((u) => u.isBaseUnit) ??
        material.units.find((u) => u.unitSlug === material.baseUnitSlug)
      warnings.push({
        kind: 'overMax',
        index: lastIndex,
        after,
        max,
        baseUnitCode: baseUnit?.unitCode ?? '',
      })
    }
  }

  return {
    warnings,
    newLinks: [...links].map(([supplierSlug, materialSlugs]) => ({ supplierSlug, materialSlugs })),
    supplierSlugs: suppliers,
  }
}
