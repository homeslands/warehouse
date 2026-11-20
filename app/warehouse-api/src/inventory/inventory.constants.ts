/**
 * Loại thay đổi trong lịch sử tồn kho (`InventoryHistory.action`).
 * - `ASSIGN`: gán vật tư vào kho lần đầu (tồn ban đầu, có thể 0).
 * - `REASSIGN`: gán lại vật tư vào kho sau khi đã từng gỡ khỏi kho.
 * - `ADJUST`: cộng/trừ `quantity` qua `PATCH .../quantity` (cửa TẠM khi chưa có phiếu).
 * - `IMPORT`: cộng `quantity` khi xác nhận phiếu nhập (`POST .../import-forms/:slug/confirm`).
 * - `EXPORT`: trừ `quantity` khi xác nhận phiếu xuất (`POST .../export-forms/:slug/confirm`).
 * - `RESERVE` / `RELEASE`: tăng / giảm `reservedQuantity` — giữ chỗ / trả chỗ khi duyệt/huỷ phiếu xuất.
 * - `REMOVE`: gỡ vật tư khỏi kho (xoá mềm dòng tồn, lúc đó tồn và giữ chỗ đều bằng 0).
 */
export enum InventoryHistoryAction {
  Assign = 'ASSIGN',
  Reassign = 'REASSIGN',
  Adjust = 'ADJUST',
  Import = 'IMPORT',
  Export = 'EXPORT',
  Reserve = 'RESERVE',
  Release = 'RELEASE',
  Remove = 'REMOVE',
}
