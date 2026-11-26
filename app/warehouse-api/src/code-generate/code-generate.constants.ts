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
  /**
   * Mã kho `{PREFIX}-{warehouseNo:3}`, vd `WH-001` — sinh 1 lần lúc tạo kho, không qua bộ đếm
   * `code_sequence_tbl` (bộ đếm đó theo từng kho, kho chưa tồn tại). Xem
   * `CodeGenerateService.generateWarehouseCode`.
   */
  Warehouse = 'WAREHOUSE',
}

/** Loại mã có quy tắc trong `code_rule_tbl` — mọi loại trừ `Barcode` (tiền tố lấy từ env). */
export type CodeRuleType = Exclude<CodeType, CodeType.Barcode>;
export const CODE_RULE_TYPES = Object.values(CodeType).filter(
  (type): type is CodeRuleType => type !== CodeType.Barcode,
);

/**
 * Tiền tố MẶC ĐỊNH — nguồn sự thật là `code_rule_tbl` (sửa qua `PATCH /code-rules/:type`), hằng này
 * chỉ để migration `1783728000049` seed và test dùng. Mã chữ: `{PREFIX}-{warehouseCode}-{yymmdd}-{seq}`,
 * vd `IM-WH-HN-01-261122-000001`.
 */
export const DEFAULT_CODE_TYPE_PREFIX: Record<CodeRuleType, string> = {
  [CodeType.Item]: 'IT',
  [CodeType.ImportForm]: 'IM',
  [CodeType.ExportForm]: 'EX',
  [CodeType.BalanceForm]: 'BL',
  [CodeType.Shelf]: 'SH',
  [CodeType.Warehouse]: 'WH',
};

/** Tiền tố mã chữ: 2 ký tự chữ HOA/số. */
export const CODE_PREFIX_REGEX = /^[A-Z0-9]{2}$/;

/**
 * Tiền tố mã vạch EAN-13 đọc từ env `BARCODE_PREFIX` (không qua `code_rule_tbl`, migration
 * `1783728000053`): đúng 2 chữ số (EAN-13 chỉ chứa số), kiểm ở `env.validation.ts` lúc boot. Không
 * khai thì dùng `20` — dải GS1 `20`-`29` dành cho mã lưu hành nội bộ, không trùng mã nhà sản xuất.
 */
export const BARCODE_PREFIX_ENV = 'BARCODE_PREFIX';
export const DEFAULT_BARCODE_PREFIX = '20';
export const BARCODE_PREFIX_REGEX = /^\d{2}$/;

/** Số chữ số của phần đếm. Vượt 999999 thì mã tự dài ra 7 chữ số, không báo lỗi. */
export const CODE_SEQUENCE_WIDTH = 6;

/** Mốc qua ngày (reset bộ đếm) tính theo giờ Việt Nam, không theo giờ UTC của server. */
export const CODE_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * EAN-13 = `{prefix:2}{số kho:3}{seq:7}{check:1}`. Số kho = `Warehouse.warehouseNo` (cấp lúc tạo kho,
 * không đổi, kho xoá mềm vẫn giữ số) — cũng là phần số của mã kho `WH-001`. Bộ đếm mã vạch KHÔNG
 * reset theo ngày (period cố định) vì ngày không có mặt trong mã — reset là cấp trùng. Hết
 * 9 999 999 số thì báo lỗi chứ không dài ra: EAN-13 phải đúng 13 chữ số.
 */
export const BARCODE_SEQUENCE_WIDTH = 7;
export const BARCODE_SEQUENCE_MAX = 9_999_999;
export const BARCODE_PERIOD = '000000';
export const BARCODE_WAREHOUSE_NO_WIDTH = 3;
export const BARCODE_WAREHOUSE_NO_MAX = 999;
