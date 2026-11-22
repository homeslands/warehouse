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
}

/** Tiền tố in lên mã: `{PREFIX}-{warehouseCode}-{yymmdd}-{seq}`, vd `IM-WH-HN-01-261122-000001`. */
export const CODE_TYPE_PREFIX: Record<CodeType, string> = {
  [CodeType.Item]: 'IT',
  [CodeType.ImportForm]: 'IM',
  [CodeType.ExportForm]: 'EX',
  [CodeType.BalanceForm]: 'BL',
  [CodeType.Shelf]: 'SH',
};

/** Số chữ số của phần đếm. Vượt 999999 thì mã tự dài ra 7 chữ số, không báo lỗi. */
export const CODE_SEQUENCE_WIDTH = 6;

/** Mốc qua ngày (reset bộ đếm) tính theo giờ Việt Nam, không theo giờ UTC của server. */
export const CODE_TIMEZONE = 'Asia/Ho_Chi_Minh';
