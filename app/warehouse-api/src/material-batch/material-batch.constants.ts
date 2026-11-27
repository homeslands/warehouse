import { ExportFormType } from 'src/export-form/export-form.constants';

/**
 * Vòng đời đơn vị hàng/lô (spec 2.9.5). Lưu dạng chuỗi (`VARCHAR(16)`), cùng kiểu với `status` của
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
 * Luồng đang có: lô sinh ra lúc xác nhận phiếu nhập ⇒ `IN_STOCK`; quét vào phiếu xuất nháp ⇒
 * `RESERVED`; xác nhận phiếu xuất ⇒ `ISSUED`/`DISPOSED`/`IN_TRANSIT` theo `ExportFormType`. Chưa
 * có luồng sinh `PENDING`/`VOID` (lô chỉ có sau khi phiếu nhập được duyệt), `RETURNED` (chưa có lý do
 * xuất "trả nhà cung cấp"), `MISSING` (chưa có kiểm kho) — khai sẵn cho các module đó.
 */
export enum MaterialBatchStatus {
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

export const MATERIAL_BATCH_STATUS_MAX_LENGTH = 16;

/** Lô còn hàng trong kho — tập lô mà phiếu xuất được giữ chỗ / trừ / trả lại. */
export const MATERIAL_BATCH_ON_HAND_STATUSES = [
  MaterialBatchStatus.InStock,
  MaterialBatchStatus.Reserved,
];

/** Lô xuất hết theo lý do xuất của phiếu xác nhận nó. */
const STATUS_OF_EXPORT_TYPE: Partial<Record<ExportFormType, MaterialBatchStatus>> = {
  [ExportFormType.Disposal]: MaterialBatchStatus.Disposed,
  [ExportFormType.Transfer]: MaterialBatchStatus.InTransit,
};

/**
 * Trạng thái lô còn trong kho, luôn suy ra từ số lượng: hết hàng ⇒ trạng thái theo lý do xuất
 * (`exportType`, mặc định `ISSUED`); toàn bộ phần còn lại đã bị giữ chỗ ⇒ `RESERVED`; còn trống ⇒
 * `IN_STOCK` (lô giữ chỗ một phần vẫn dùng được cho phiếu khác).
 */
export const statusOfBatch = (
  remaining: number,
  reserved: number,
  exportType?: ExportFormType,
): MaterialBatchStatus => {
  if (remaining <= 0)
    return (exportType && STATUS_OF_EXPORT_TYPE[exportType]) ?? MaterialBatchStatus.Issued;
  return reserved >= remaining ? MaterialBatchStatus.Reserved : MaterialBatchStatus.InStock;
};
