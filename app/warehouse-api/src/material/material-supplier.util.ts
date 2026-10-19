import { EntityManager, QueryFailedError } from 'typeorm';
import { Material } from './material.entity';

/** Quan hệ n - n vật tư - nhà cung cấp; `Material` là phía sở hữu bảng join `material_supplier_tbl`. */
const SUPPLIERS = 'suppliers';

type MaterialSupplierPair = { materialId: string; supplierId: string };

const isDuplicateEntry = (error: unknown) =>
  error instanceof QueryFailedError &&
  (error.driverError as { code?: string } | undefined)?.code === 'ER_DUP_ENTRY';

/**
 * Ghi bảng join `material_supplier_tbl` qua `RelationQueryBuilder` (`relation(Material, 'suppliers')`),
 * dùng chung cho `PUT /materials/:slug/suppliers`, `PUT|DELETE /suppliers/:slug/materials`, tạo vật
 * tư trong kho và phiếu nhập. Mọi caller đều chạy trong transaction (bắt buộc với `remove`, xem dưới).
 *
 * `add()` không có `INSERT IGNORE`: 2 request gắn cùng 1 cặp đồng thời thì request sau ném
 * `ER_DUP_ENTRY`. Giữ idempotent bằng cách bắt lỗi đó rồi gắn lại TỪNG cặp, bỏ qua cặp đã có —
 * MySQL chỉ rollback câu lệnh lỗi, transaction của caller vẫn dùng tiếp được.
 */
export async function insertMaterialSuppliers(
  manager: EntityManager,
  pairs: MaterialSupplierPair[],
): Promise<void> {
  const supplierIdsByMaterial = new Map<string, Set<string>>();
  for (const { materialId, supplierId } of pairs) {
    const supplierIds = supplierIdsByMaterial.get(materialId) ?? new Set<string>();
    supplierIds.add(supplierId);
    supplierIdsByMaterial.set(materialId, supplierIds);
  }

  for (const [materialId, supplierIds] of supplierIdsByMaterial) {
    const relation = () =>
      manager.createQueryBuilder().relation(Material, SUPPLIERS).of(materialId);
    try {
      await relation().add([...supplierIds]);
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error;
      for (const supplierId of supplierIds) {
        try {
          await relation().add(supplierId);
        } catch (pairError) {
          if (!isDuplicateEntry(pairError)) throw pairError;
        }
      }
    }
  }
}

/**
 * Gỡ mọi cặp (vật tư ∈ `materialIds`, nhà cung cấp ∈ `supplierIds`). Trả số dòng đã xoá.
 *
 * `remove()` không trả số dòng bị xoá, nên đếm trước bằng `SELECT ... FOR UPDATE` trên đúng các cặp
 * đó: dòng đã khoá không bị request khác gỡ chen giữa ⇒ số đếm = số `remove()` xoá thật (caller như
 * `SupplierService.detachMaterials` dựa vào nó để phát hiện bị gỡ chen và rollback). Khoá này đòi
 * transaction — gọi ngoài transaction thì TypeORM ném `PessimisticLockTransactionRequiredError`.
 */
export async function deleteMaterialSuppliers(
  manager: EntityManager,
  materialIds: string[],
  supplierIds: string[],
): Promise<number> {
  if (!materialIds.length || !supplierIds.length) return 0;

  // Đọc thẳng bảng join (tên bảng/cột lấy từ metadata của quan hệ) thay vì JOIN qua `material` →
  // `supplier`: MySQL `FOR UPDATE` khoá luôn dòng của mọi bảng được JOIN.
  const junction = manager.connection
    .getMetadata(Material)
    .findRelationWithPropertyPath(SUPPLIERS).junctionEntityMetadata;
  const [materialColumn] = junction.ownerColumns;
  const [supplierColumn] = junction.inverseColumns;
  const attached = await manager
    .createQueryBuilder()
    .select(`ms.${materialColumn.databaseName}`)
    .from(junction.tableName, 'ms')
    .where(`ms.${materialColumn.databaseName} IN (:...materialIds)`, { materialIds })
    .andWhere(`ms.${supplierColumn.databaseName} IN (:...supplierIds)`, { supplierIds })
    .setLock('pessimistic_write')
    .getRawMany();
  if (!attached.length) return 0;

  await manager
    .createQueryBuilder()
    .relation(Material, SUPPLIERS)
    .of(materialIds)
    .remove(supplierIds);
  return attached.length;
}
