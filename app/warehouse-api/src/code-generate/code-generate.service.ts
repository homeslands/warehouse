import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { CodeSequence } from './code-sequence.entity';
import { CodeRule } from './code-rule.entity';
import {
  BARCODE_PERIOD,
  BARCODE_PREFIX_ENV,
  BARCODE_SEQUENCE_MAX,
  BARCODE_SEQUENCE_WIDTH,
  BARCODE_WAREHOUSE_NO_MAX,
  BARCODE_WAREHOUSE_NO_WIDTH,
  CODE_SEQUENCE_WIDTH,
  CODE_TIMEZONE,
  CodeType,
  DEFAULT_BARCODE_PREFIX,
} from './code-generate.constants';
import { CodeGenerateException } from './code-generate.exception';
import { CodeGenerateValidation } from './code-generate.validation';
import { ean13CheckDigit } from './ean13.util';

const periodFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: CODE_TIMEZONE,
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
});

/** Số kho 3 chữ số, dùng chung cho mã kho `WH-001` và mã vạch. */
const padWarehouseNo = (warehouseNo: number): string =>
  String(warehouseNo).padStart(BARCODE_WAREHOUSE_NO_WIDTH, '0');

/** EAN-13 `{prefix:2}{warehouseNo:3}{seq:7}{check}`. */
const toBarcode = (prefix: string, warehouseNo: string, seq: number): string => {
  const digits12 = `${prefix}${warehouseNo}${String(seq).padStart(BARCODE_SEQUENCE_WIDTH, '0')}`;
  return `${digits12}${ean13CheckDigit(digits12)}`;
};

/** `yymmdd` của `date` theo `CODE_TIMEZONE`. */
export const toCodePeriod = (date: Date): string => {
  const parts = Object.fromEntries(
    periodFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}${parts.month}${parts.day}`;
};

/**
 * Sinh mã `{PREFIX}-{warehouseCode}-{yymmdd}-{seq}` không trùng, không tái sử dụng. Riêng
 * `CodeType.Barcode` sinh EAN-13 `{prefix}{số kho}{seq:7}{check}` — xem `BARCODE_*` (số kho =
 * `Warehouse.warehouseNo`). Mã kho (`CodeType.Warehouse`) KHÔNG đi qua đây mà qua
 * `generateWarehouseCode`.
 * Tiền tố mã chữ đọc từ `code_rule_tbl` (`CodeRule`) trong cùng transaction; tiền tố mã vạch đọc từ
 * env `BARCODE_PREFIX` (mặc định `20`) một lần lúc khởi tạo service.
 *
 * Chống trùng khi nhiều request/thiết bị sinh mã cùng lúc bằng `SELECT ... FOR UPDATE` trên dòng
 * bộ đếm (type, kho, ngày): request sau chờ tới khi transaction của request trước commit/rollback.
 * Vì khoá chỉ có tác dụng trong transaction, mọi hàm ở đây nhận `manager` của transaction đang
 * chạy (`TransactionManagerService.execute`) — gọi ngoài transaction là lỗi. Nên gọi càng muộn
 * càng tốt trong transaction (ngay trước khi `save`) để rút ngắn thời gian giữ khoá.
 *
 * Transaction rollback ⇒ bộ đếm cũng rollback; số đó chưa từng được lưu ở đâu nên cấp lại không
 * phải "tái sử dụng". Phiếu xoá mềm/huỷ không trả số về ⇒ mã đã lưu không bao giờ cấp lại.
 */
@Injectable()
export class CodeGenerateService {
  /** Đã kiểm 2 chữ số ở `env.validation.ts` lúc boot. */
  private readonly barcodePrefix: string;

  constructor(configService: ConfigService) {
    this.barcodePrefix =
      configService.get<string>(BARCODE_PREFIX_ENV)?.trim() || DEFAULT_BARCODE_PREFIX;
  }

  async generate(
    manager: EntityManager,
    type: CodeType,
    warehouse: Warehouse,
    now: Date = new Date(),
  ): Promise<string> {
    const [code] = await this.generateMany(manager, type, warehouse, 1, now);
    return code;
  }

  /** Cấp `count` mã liên tiếp với 1 lần khoá + 1 lần UPDATE (vd quét nhiều sản phẩm 1 lượt). */
  async generateMany(
    manager: EntityManager,
    type: CodeType,
    warehouse: Warehouse,
    count: number,
    now: Date = new Date(),
  ): Promise<string[]> {
    this.assertCanGenerate(manager, type, warehouse, count);
    const isBarcode = type === CodeType.Barcode;
    const prefix = isBarcode ? this.barcodePrefix : await this.rulePrefix(manager, type);

    const warehouseNo = isBarcode ? padWarehouseNo(warehouse.warehouseNo) : null;
    const period = isBarcode ? BARCODE_PERIOD : toCodePeriod(now);
    const where = { type, warehouseId: warehouse.id, period };

    // Đảm bảo dòng bộ đếm tồn tại TRƯỚC khi khoá. `SELECT ... FOR UPDATE` trên dòng chưa có chỉ
    // lấy gap lock: 2 transaction cùng lấy gap lock rồi cùng INSERT là deadlock. Dòng đã có thì
    // câu này không đổi gì.
    await manager.query(
      'INSERT INTO `code_sequence_tbl` (`type_column`, `warehouse_id_column`, `period_column`, `last_value_column`) ' +
        'VALUES (?, ?, ?, 0) ON DUPLICATE KEY UPDATE `last_value_column` = `last_value_column`',
      [type, warehouse.id, period],
    );

    // Không kèm relations: MySQL `FOR UPDATE` khoá luôn dòng của bảng JOIN (dòng kho).
    const sequence = await manager.findOne(CodeSequence, {
      where,
      lock: { mode: 'pessimistic_write' },
    });
    const start = (sequence?.lastValue ?? 0) + 1;
    const last = start + count - 1;
    if (isBarcode && last > BARCODE_SEQUENCE_MAX)
      throw new CodeGenerateException(CodeGenerateValidation.CODE_GENERATE_BARCODE_EXHAUSTED);
    await manager.update(CodeSequence, where, { lastValue: last });

    return Array.from({ length: count }, (_, i) =>
      isBarcode
        ? toBarcode(prefix, warehouseNo, start + i)
        : `${prefix}-${warehouse.code}-${period}-${String(start + i).padStart(CODE_SEQUENCE_WIDTH, '0')}`,
    );
  }

  private assertCanGenerate(
    manager: EntityManager,
    type: CodeType,
    warehouse: Warehouse,
    count: number,
  ): void {
    this.assertInTransaction(manager);
    if (type === CodeType.Warehouse)
      throw new CodeGenerateException(CodeGenerateValidation.CODE_GENERATE_TYPE_NOT_SUPPORTED);
    if (!Number.isInteger(count) || count < 1)
      throw new CodeGenerateException(CodeGenerateValidation.CODE_GENERATE_COUNT_INVALID);
    // Mã vạch không in `warehouse.code` (chỉ số kho) nên không cần nó.
    if (type !== CodeType.Barcode && !warehouse.code)
      throw new CodeGenerateException(CodeGenerateValidation.CODE_GENERATE_WAREHOUSE_CODE_MISSING);
  }

  private async rulePrefix(manager: EntityManager, type: CodeType): Promise<string> {
    const rule = await manager.findOne(CodeRule, { where: { type } });
    if (!rule) throw new CodeGenerateException(CodeGenerateValidation.CODE_RULE_NOT_FOUND);
    return rule.prefix;
  }

  private assertInTransaction(manager: EntityManager): void {
    if (!manager.queryRunner?.isTransactionActive)
      throw new CodeGenerateException(CodeGenerateValidation.CODE_GENERATE_TRANSACTION_REQUIRED);
  }

  /**
   * Cấp số kho + mã kho `{PREFIX}-{warehouseNo:3}` (vd `WH-001`) cho kho SẮP tạo — gọi trong
   * transaction tạo kho, ngay trước `save`. `warehouseNo` = MAX + 1 tính cả kho xoá mềm (kho chỉ xoá
   * mềm ⇒ số đã cấp không bao giờ cấp lại, mã vạch đã in không đổi nghĩa); quá 999 ⇒
   * `CODE_GENERATE_WAREHOUSE_NO_EXHAUSTED` (mã vạch chỉ có 3 chữ số cho kho).
   *
   * Chống 2 request tạo kho cùng lúc lấy cùng MAX: khoá `FOR UPDATE` dòng quy tắc `WAREHOUSE` của
   * `code_rule_tbl` (luôn tồn tại, không phải gap lock) ⇒ các lần tạo kho chạy nối tiếp tới khi
   * transaction trước commit. UNIQUE trên `warehouse_no_column` là lưới an toàn cuối.
   */
  async generateWarehouseCode(
    manager: EntityManager,
  ): Promise<{ warehouseNo: number; code: string }> {
    this.assertInTransaction(manager);

    const rule = await manager.findOne(CodeRule, {
      where: { type: CodeType.Warehouse },
      lock: { mode: 'pessimistic_write' },
    });
    if (!rule) throw new CodeGenerateException(CodeGenerateValidation.CODE_RULE_NOT_FOUND);

    const { max } = await manager
      .createQueryBuilder(Warehouse, 'warehouse')
      .withDeleted()
      .select('MAX(warehouse.warehouseNo)', 'max')
      .getRawOne<{ max: number | string | null }>();
    const warehouseNo = Number(max ?? 0) + 1;
    if (warehouseNo > BARCODE_WAREHOUSE_NO_MAX)
      throw new CodeGenerateException(CodeGenerateValidation.CODE_GENERATE_WAREHOUSE_NO_EXHAUSTED);

    return { warehouseNo, code: `${rule.prefix}-${padWarehouseNo(warehouseNo)}` };
  }
}
