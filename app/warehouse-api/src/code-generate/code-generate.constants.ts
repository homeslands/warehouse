/**
 * Loại mã nghiệp vụ do hệ thống tự sinh (`CodeGenerateService`). Giá trị enum là thứ lưu vào
 * `code_sequence_tbl.type_column` — đổi giá trị là mở bộ đếm mới từ 1, dễ sinh trùng với mã cũ.
 */
export enum CodeType {
  Item = 'ITEM',
  ImportForm = 'IMPORT_FORM',
  ExportForm = 'EXPORT_FORM',
  BalanceForm = 'BALANCE_FORM',
  Shelf = 'SHELF',
  /** Mã vạch EAN-13 cho vật tư không có mã vạch của nhà sản xuất — xem `BARCODE_*` bên dưới. */
  Barcode = 'BARCODE',
}

/**
 * Tiền tố MẶC ĐỊNH — nguồn sự thật là `code_rule_tbl` (sửa qua `PATCH /code-rules/:type`), hằng này
 * chỉ để migration `1783728000049` seed và test dùng. Mã chữ: `{PREFIX}-{warehouseCode}-{yymmdd}-{seq}`,
 * vd `IM-WH-HN-01-261122-000001`. Mã vạch: 2 chữ số, mặc định `20` (dải GS1 dành cho lưu hành nội bộ).
 */
export const DEFAULT_CODE_TYPE_PREFIX: Record<CodeType, string> = {
  [CodeType.Item]: 'IT',
  [CodeType.ImportForm]: 'IM',
  [CodeType.ExportForm]: 'EX',
  [CodeType.BalanceForm]: 'BL',
  [CodeType.Shelf]: 'SH',
  [CodeType.Barcode]: '20',
};

/** Tiền tố mã chữ: 2 ký tự chữ HOA/số. Mã vạch: đúng 2 chữ số (EAN-13 chỉ chứa số). */
export const CODE_PREFIX_REGEX = /^[A-Z0-9]{2}$/;
export const BARCODE_PREFIX_REGEX = /^\d{2}$/;

/** Số chữ số của phần đếm. Vượt 999999 thì mã tự dài ra 7 chữ số, không báo lỗi. */
export const CODE_SEQUENCE_WIDTH = 6;

/** Mốc qua ngày (reset bộ đếm) tính theo giờ Việt Nam, không theo giờ UTC của server. */
export const CODE_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * EAN-13 = `{prefix:2}{số kho:3}{seq:7}{check:1}`. Số kho = thứ tự tạo của kho (tính cả kho xoá
 * mềm, kho tạo đầu tiên là `001`), tính lúc sinh mã — xem `CodeGenerateService.barcodeWarehouseNo`. Bộ đếm mã vạch KHÔNG reset theo
 * ngày (period cố định) vì ngày không có mặt trong mã — reset là cấp trùng. Hết 9 999 999 số thì
 * báo lỗi chứ không dài ra: EAN-13 phải đúng 13 chữ số.
 */
export const BARCODE_SEQUENCE_WIDTH = 7;
export const BARCODE_SEQUENCE_MAX = 9_999_999;
export const BARCODE_PERIOD = '000000';
export const BARCODE_WAREHOUSE_NO_WIDTH = 3;
export const BARCODE_WAREHOUSE_NO_MAX = 999;
