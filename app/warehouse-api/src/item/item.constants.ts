import { ExportFormType } from 'src/export-form/export-form.constants';

/**
 * Vòng đời đơn vị hàng (item) (spec 2.9.5). Lưu dạng chuỗi (`VARCHAR(16)`), cùng kiểu với `status` của
 * phiếu nhập/xuất.
 *
 * | Trạng thái    | Chuyển từ                   | Tính vào tồn      |
 * |---------------|-----------------------------|-------------------|
 * | `PENDING`     | (mới tạo)                   | Không             |
 * | `IN_STOCK`    | `PENDING`, `IN_TRANSIT`     | Có                |
 * | `RESERVED`    | `IN_STOCK`                  | Không khả dụng    |
 * | `IN_TRANSIT`  | `RESERVED`                  | Tồn đang chuyển   |
 * | `ISSUED`      | `RESERVED`                  | Không             |
 * | `DISPOSED`    | `RESERVED`                  | Không             |
 * | `RETURNED`    | `RESERVED`                  | Không             |
 * | `MISSING`     | `IN_STOCK`, `IN_TRANSIT`    | Không             |
 * | `VOID`        | `PENDING`                   | Không             |
 *
 * Luồng đang có: thêm vào phiếu nhập nháp ⇒ `PENDING`; xác nhận phiếu nhập ⇒ `IN_STOCK`, huỷ ⇒
 * `VOID`; quét vào phiếu xuất nháp ⇒ `RESERVED`; xác nhận phiếu xuất ⇒ `ISSUED`/`DISPOSED`/
 * `IN_TRANSIT` theo `ExportFormType`. Chưa có luồng sinh `RETURNED` (chưa có lý do xuất "trả nhà
 * cung cấp"), `MISSING` (chưa có kiểm kho) — khai sẵn cho các module đó.
 */
export enum ItemStatus {
  Pending = 'PENDING',
  InStock = 'IN_STOCK',
  Reserved = 'RESERVED',
  InTransit = 'IN_TRANSIT',
  Issued = 'ISSUED',
  Disposed = 'DISPOSED',
  Returned = 'RETURNED',
  Missing = 'MISSING',
  Void = 'VOID',
}

export const ITEM_STATUS_MAX_LENGTH = 16;

/** Item còn hàng trong kho — tập item mà phiếu xuất được giữ chỗ / trừ / trả lại. */
export const ITEM_ON_HAND_STATUSES = [ItemStatus.InStock, ItemStatus.Reserved];

/** Item xuất hết theo lý do xuất của phiếu xác nhận nó. */
const STATUS_OF_EXPORT_TYPE: Partial<Record<ExportFormType, ItemStatus>> = {
  [ExportFormType.Disposal]: ItemStatus.Disposed,
  [ExportFormType.Transfer]: ItemStatus.InTransit,
};

/**
 * Trạng thái item còn trong kho, luôn suy ra từ số lượng: hết hàng ⇒ trạng thái theo lý do xuất
 * (`exportType`, mặc định `ISSUED`); toàn bộ phần còn lại đã bị giữ chỗ ⇒ `RESERVED`; còn trống ⇒
 * `IN_STOCK` (item giữ chỗ một phần vẫn dùng được cho phiếu khác).
 */
export const statusOfItem = (
  remaining: number,
  reserved: number,
  exportType?: ExportFormType,
): ItemStatus => {
  if (remaining <= 0) return (exportType && STATUS_OF_EXPORT_TYPE[exportType]) ?? ItemStatus.Issued;
  return reserved >= remaining ? ItemStatus.Reserved : ItemStatus.InStock;
};
