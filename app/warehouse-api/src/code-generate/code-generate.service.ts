import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { CodeSequence } from './code-sequence.entity';
import { CodeRule } from './code-rule.entity';
import {
  BARCODE_PERIOD,
  BARCODE_SEQUENCE_MAX,
  BARCODE_SEQUENCE_WIDTH,
  BARCODE_WAREHOUSE_NO_MAX,
  BARCODE_WAREHOUSE_NO_WIDTH,
  CODE_SEQUENCE_WIDTH,
  CODE_TIMEZONE,
  CodeType,
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
 * `CodeType.Barcode` sinh EAN-13 `{prefix}{số kho}{seq:7}{check}` — xem `BARCODE_*` và
 * `barcodeWarehouseNo`.
 * Tiền tố đọc từ `code_rule_tbl` (`CodeRule`) trong cùng transaction.
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

    const rule = await manager.findOne(CodeRule, { where: { type } });
    if (!rule) throw new CodeGenerateException(CodeGenerateValidation.CODE_RULE_NOT_FOUND);

    const warehouseNo = isBarcode ? await this.barcodeWarehouseNo(manager, warehouse) : null;
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
        ? toBarcode(rule.prefix, warehouseNo, start + i)
        : `${rule.prefix}-${warehouse.code}-${period}-${String(start + i).padStart(CODE_SEQUENCE_WIDTH, '0')}`,
    );
  }

  private assertCanGenerate(
    manager: EntityManager,
    type: CodeType,
    warehouse: Warehouse,
    count: number,
  ): void {
    if (!manager.queryRunner?.isTransactionActive)
      throw new CodeGenerateException(CodeGenerateValidation.CODE_GENERATE_TRANSACTION_REQUIRED);
    if (!Number.isInteger(count) || count < 1)
      throw new CodeGenerateException(CodeGenerateValidation.CODE_GENERATE_COUNT_INVALID);
    // Mã vạch không in `warehouse.code` (chỉ số kho) nên không cần nó.
    if (type !== CodeType.Barcode && !warehouse.code)
      throw new CodeGenerateException(CodeGenerateValidation.CODE_GENERATE_WAREHOUSE_CODE_MISSING);
  }

  /**
   * Số kho 3 chữ số trong mã vạch = thứ tự tạo của kho: đếm mọi kho (kể cả xoá mềm) tạo trước hoặc
   * cùng lúc với kho này, hoà thì so `id`. Không lưu ở đâu cả — không thêm cột vào `Warehouse`.
   *
   * Ổn định (mã vạch đã in không bao giờ đổi nghĩa) vì: kho chỉ xoá mềm và vẫn được đếm
   * (`withDeleted`); kho mới luôn có `createdAt` lớn nhất nên xếp cuối, không đẩy số của kho cũ.
   * Xoá cứng 1 kho cũ sẽ làm lệch số của mọi kho sau nó — nhưng kho đã sinh mã thì có dòng
   * `code_sequence_tbl` trỏ tới (FK RESTRICT) nên DB chặn. Đọc 2 alias trên cùng bảng ⇒ so sánh
   * `createdAt` ở độ chính xác của DB (micro giây), không qua `Date` của JS (mili giây).
   */
  private async barcodeWarehouseNo(manager: EntityManager, warehouse: Warehouse): Promise<string> {
    const position = await manager
      .createQueryBuilder(Warehouse, 'other')
      .withDeleted()
      .innerJoin(Warehouse, 'self', 'self.id = :id', { id: warehouse.id })
      .where(
        '(other.createdAt < self.createdAt OR (other.createdAt = self.createdAt AND other.id <= self.id))',
      )
      .getCount();
    if (position > BARCODE_WAREHOUSE_NO_MAX)
      throw new CodeGenerateException(CodeGenerateValidation.CODE_GENERATE_WAREHOUSE_NO_EXHAUSTED);
    return String(position).padStart(BARCODE_WAREHOUSE_NO_WIDTH, '0');
  }
}
