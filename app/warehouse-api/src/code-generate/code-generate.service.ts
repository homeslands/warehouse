import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { CodeSequence } from './code-sequence.entity';
import {
  CODE_SEQUENCE_WIDTH,
  CODE_TIMEZONE,
  CODE_TYPE_PREFIX,
  CodeType,
} from './code-generate.constants';
import { CodeGenerateException } from './code-generate.exception';
import { CodeGenerateValidation } from './code-generate.validation';

const periodFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: CODE_TIMEZONE,
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
});

/** `yymmdd` của `date` theo `CODE_TIMEZONE`. */
export const toCodePeriod = (date: Date): string => {
  const parts = Object.fromEntries(
    periodFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}${parts.month}${parts.day}`;
};

/**
 * Sinh mã `{PREFIX}-{warehouseCode}-{yymmdd}-{seq}` không trùng, không tái sử dụng.
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
    if (!manager.queryRunner?.isTransactionActive)
      throw new CodeGenerateException(CodeGenerateValidation.CODE_GENERATE_TRANSACTION_REQUIRED);
    if (!Number.isInteger(count) || count < 1)
      throw new CodeGenerateException(CodeGenerateValidation.CODE_GENERATE_COUNT_INVALID);
    if (!warehouse.code)
      throw new CodeGenerateException(CodeGenerateValidation.CODE_GENERATE_WAREHOUSE_CODE_MISSING);

    const period = toCodePeriod(now);
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
    await manager.update(CodeSequence, where, { lastValue: start + count - 1 });

    const prefix = `${CODE_TYPE_PREFIX[type]}-${warehouse.code}-${period}`;
    return Array.from(
      { length: count },
      (_, i) => `${prefix}-${String(start + i).padStart(CODE_SEQUENCE_WIDTH, '0')}`,
    );
  }
}
