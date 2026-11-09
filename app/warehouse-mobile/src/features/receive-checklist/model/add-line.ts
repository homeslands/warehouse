import type { AvailableMaterial, AvailableSupplier, AvailableUnit } from '@/entities/import-form'

import { lineKey, type LocalLine, type ReceiveDraft, type ReceiveHeader } from './draft'

/**
 * NCC của dòng thêm trên máy (spec §5.4): NCC đầu phiếu nếu vật tư có NCC đó; không thì NCC duy nhất
 * của vật tư; không thì `null` (server tự lấy NCC duy nhất nếu có).
 */
export function lineSupplier(
  material: Pick<AvailableMaterial, 'suppliers'>,
  headerSupplier: string | null,
): AvailableSupplier | null {
  const header = headerSupplier
    ? material.suppliers.find((s) => s.slug === headerSupplier)
    : undefined
  if (header) return header
  return material.suppliers.length === 1 ? material.suppliers[0] : null
}

/** Bên bán gắn cứng cho mọi dòng (phiếu tạo trên máy đã chọn bên bán ở đầu phiếu). */
export type FixedSupplier = { slug: string; name: string | null }

/**
 * Dòng thêm trên máy: coi như đã kiểm, `base` null (không có số trên phiếu). `fixedSupplier` (phiếu
 * tạo trên máy có bên bán đầu phiếu): MỌI dòng mang bên bán đó — một phiếu một bên bán, backend tự gắn
 * bên bán vào vật tư chưa có. Không có → luật suy ra `lineSupplier` (phiếu đã có trên server).
 */
export function newLocalLine({
  material,
  unit,
  quantity,
  unitPrice,
  headerSupplier,
  fixedSupplier,
}: {
  material: AvailableMaterial
  unit: AvailableUnit
  quantity: number
  unitPrice: number
  headerSupplier: string | null
  fixedSupplier?: FixedSupplier
}): LocalLine {
  const supplier = fixedSupplier ?? lineSupplier(material, headerSupplier)
  return {
    key: lineKey({ materialSlug: material.slug, unitSlug: unit.unitSlug }),
    materialSlug: material.slug,
    unitSlug: unit.unitSlug,
    materialCode: material.code,
    materialName: material.name,
    unitName: unit.unitName,
    unitPrice,
    supplierSlug: supplier?.slug ?? null,
    supplierName: supplier?.name ?? null,
    base: null,
    quantity,
    expiryDate: null,
    note: null,
    checked: true,
    changedOnServer: false,
  }
}

/** Đổi bên bán đầu phiếu của phiếu tạo trên máy: ghi lại bên bán lên mọi dòng. */
export function stampSupplier(lines: LocalLine[], supplier: FixedSupplier): LocalLine[] {
  return lines.map((l) => ({ ...l, supplierSlug: supplier.slug, supplierName: supplier.name }))
}

/**
 * Đổi bên bán đầu phiếu của bản nháp phiếu mới: đầu phiếu mang `supplier`, mọi dòng đã thêm được ghi
 * lại bên bán đó (một phiếu một bên bán). Không đổi (trả đúng `draft`) khi không có bên bán hoặc đó
 * đã là bên bán đầu phiếu.
 */
export function restampSupplier(draft: ReceiveDraft, supplier: FixedSupplier | null): ReceiveDraft {
  if (!supplier || supplier.slug === draft.header.supplierSlug) return draft
  return {
    ...draft,
    header: { ...draft.header, supplierSlug: supplier.slug },
    lines: stampSupplier(draft.lines, supplier),
  }
}

/** Bản nháp phiếu mới (chưa có trên server): chưa có version, chưa có dòng, không có `headerBase`. */
export function newDraft(
  header: Omit<ReceiveHeader, 'file'> & { file?: ReceiveHeader['file'] },
): ReceiveDraft {
  return {
    formSlug: 'new',
    version: null,
    header: { ...header, file: header.file ?? null },
    headerBase: null,
    lines: [],
    savedAt: Date.now(),
  }
}
