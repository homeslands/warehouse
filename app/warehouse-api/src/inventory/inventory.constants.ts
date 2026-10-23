/**
 * Loại thay đổi trong lịch sử tồn kho (`InventoryHistory.action`).
 * - `ASSIGN`: gán vật tư vào kho (tồn ban đầu, có thể 0).
 * - `ADJUST`: cộng/trừ `quantity` qua `PATCH .../quantity` (cửa TẠM khi chưa có phiếu).
 * - `IMPORT`: cộng `quantity` khi xác nhận phiếu nhập (`POST .../import-forms/:slug/confirm`).
 * - `EXPORT`: trừ `quantity` khi xác nhận phiếu xuất (`POST .../export-forms/:slug/confirm`).
 * - `RESERVE` / `RELEASE`: tăng / giảm `reservedQuantity` — khai sẵn cho phiếu xuất, CHƯA có luồng ghi.
 * - `REMOVE`: gỡ vật tư khỏi kho (xoá mềm dòng tồn, lúc đó tồn và giữ chỗ đều bằng 0).
 */
export enum InventoryHistoryAction {
  Assign = 'ASSIGN',
  Adjust = 'ADJUST',
  Import = 'IMPORT',
  Export = 'EXPORT',
  Reserve = 'RESERVE',
  Release = 'RELEASE',
  Remove = 'REMOVE',
}
