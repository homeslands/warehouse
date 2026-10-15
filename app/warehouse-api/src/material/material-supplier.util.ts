import { EntityManager } from 'typeorm';
import { MATERIAL_SUPPLIER_TABLE } from './material.entity';

/**
 * Ghi thẳng bảng join `material_supplier_tbl` (n - n vật tư - nhà cung cấp), dùng chung cho
 * `PUT /materials/:slug/suppliers` và `PUT|DELETE /suppliers/:slug/materials`.
 *
 * SQL tay thay vì `RelationQueryBuilder.add()`: `INSERT IGNORE` khiến 2 request gắn cùng 1 cặp đồng
 * thời đều thành công (idempotent) thay vì request sau ném `ER_DUP_ENTRY` thành 500.
 */
export async function insertMaterialSuppliers(
  manager: EntityManager,
  pairs: { materialId: string; supplierId: string }[],
): Promise<void> {
  if (!pairs.length) return;
  await manager.query(
    `INSERT IGNORE INTO \`${MATERIAL_SUPPLIER_TABLE}\` (\`material_id_column\`, \`supplier_id_column\`) VALUES ?`,
    [pairs.map(({ materialId, supplierId }) => [materialId, supplierId])],
  );
}

/** Gỡ mọi cặp (vật tư ∈ `materialIds`, nhà cung cấp ∈ `supplierIds`). Trả số dòng đã xoá. */
export async function deleteMaterialSuppliers(
  manager: EntityManager,
  materialIds: string[],
  supplierIds: string[],
): Promise<number> {
  if (!materialIds.length || !supplierIds.length) return 0;
  const result = await manager.query(
    `DELETE FROM \`${MATERIAL_SUPPLIER_TABLE}\` WHERE \`material_id_column\` IN (?) AND \`supplier_id_column\` IN (?)`,
    [materialIds, supplierIds],
  );
  return result?.affectedRows ?? 0;
}
