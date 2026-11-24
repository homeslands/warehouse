import { EntityManager } from 'typeorm';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { CodeGenerateService, toCodePeriod } from './code-generate.service';
import { CodeType, DEFAULT_CODE_TYPE_PREFIX } from './code-generate.constants';
import { CodeSequence } from './code-sequence.entity';
import { CodeRule } from './code-rule.entity';
import { CodeGenerateValidation } from './code-generate.validation';
import { isValidEan13 } from './ean13.util';

describe('CodeGenerateService', () => {
  const service = new CodeGenerateService();
  const warehouse = { id: 'wh-1', code: 'WH-HN-01' } as Warehouse;
  // 2026-11-22 09:00 giờ Việt Nam.
  const now = new Date('2026-11-22T02:00:00Z');

  /**
   * `findOne` phục vụ 2 entity: `CodeRule` (tiền tố, mặc định lấy `DEFAULT_CODE_TYPE_PREFIX`, ghi đè
   * qua `prefixes`; `null` = chưa seed) và `CodeSequence` (dòng bộ đếm bị khoá) — tách ra
   * `findRule`/`findSequence` để assert riêng từng lần gọi. `positionQuery.getCount` = thứ tự tạo
   * của kho (số kho trong mã vạch), mặc định `1`.
   */
  const makeManager = (
    lastValue: number | null,
    isTransactionActive = true,
    prefixes: Partial<Record<CodeType, string | null>> = {},
    warehousePosition = 1,
  ) => {
    const positionQuery = {
      withDeleted: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(warehousePosition),
    };
    const findRule = jest.fn(async ({ where: { type } }: { where: { type: CodeType } }) => {
      const prefix = type in prefixes ? prefixes[type] : DEFAULT_CODE_TYPE_PREFIX[type];
      return prefix === null ? null : ({ type, prefix } as CodeRule);
    });
    const findSequence = jest
      .fn()
      .mockResolvedValue(lastValue === null ? null : ({ lastValue } as CodeSequence));
    const manager = {
      queryRunner: { isTransactionActive },
      query: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn((entity: unknown, options: never) =>
        entity === CodeRule ? findRule(options) : findSequence(entity, options),
      ),
      findRule,
      findSequence,
      createQueryBuilder: jest.fn(() => positionQuery),
      positionQuery,
      update: jest.fn().mockResolvedValue(undefined),
    };
    return manager as typeof manager & EntityManager;
  };

  const expectError = async (promise: Promise<unknown>, code: number) => {
    await expect(promise).rejects.toMatchObject({ code });
  };

  describe('toCodePeriod', () => {
    it('formats yymmdd in Vietnam time, not UTC', () => {
      // 21/11 17:30 UTC = 22/11 00:30 giờ Việt Nam ⇒ đã sang ngày mới.
      expect(toCodePeriod(new Date('2026-11-21T17:30:00Z'))).toBe('261122');
      expect(toCodePeriod(new Date('2026-11-21T16:59:59Z'))).toBe('261121');
    });
  });

  describe('generate', () => {
    it('ensures the row, locks it FOR UPDATE, then increments — in that order', async () => {
      const manager = makeManager(41);

      const code = await service.generate(manager, CodeType.ImportForm, warehouse, now);

      expect(code).toBe('IM-WH-HN-01-261122-000042');
      const where = { type: CodeType.ImportForm, warehouseId: 'wh-1', period: '261122' };
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('ON DUPLICATE KEY UPDATE'),
        [CodeType.ImportForm, 'wh-1', '261122'],
      );
      expect(manager.findSequence).toHaveBeenCalledWith(CodeSequence, {
        where,
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.update).toHaveBeenCalledWith(CodeSequence, where, { lastValue: 42 });
      const order = [manager.query, manager.findSequence, manager.update].map(
        (fn) => fn.mock.invocationCallOrder[0],
      );
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it('starts at 000001 for a fresh counter', async () => {
      const manager = makeManager(0);
      await expect(service.generate(manager, CodeType.Item, warehouse, now)).resolves.toBe(
        'IT-WH-HN-01-261122-000001',
      );
    });

    it.each([
      [CodeType.Item, 'IT'],
      [CodeType.ImportForm, 'IM'],
      [CodeType.ExportForm, 'EX'],
      [CodeType.BalanceForm, 'BL'],
      [CodeType.Shelf, 'SH'],
    ])('uses the %s prefix %s', async (type, prefix) => {
      const code = await service.generate(makeManager(0), type, warehouse, now);
      expect(code.startsWith(`${prefix}-WH-HN-01-261122-`)).toBe(true);
    });

    it('grows past 6 digits instead of failing', async () => {
      const code = await service.generate(makeManager(999999), CodeType.Item, warehouse, now);
      expect(code).toBe('IT-WH-HN-01-261122-1000000');
    });

    it('refuses to run outside a transaction (FOR UPDATE would not hold)', async () => {
      const manager = makeManager(0, false);
      await expectError(
        service.generate(manager, CodeType.Item, warehouse, now),
        CodeGenerateValidation.CODE_GENERATE_TRANSACTION_REQUIRED.code,
      );
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('rejects a warehouse without code', async () => {
      await expectError(
        service.generate(makeManager(0), CodeType.Item, { id: 'wh-1' } as Warehouse, now),
        CodeGenerateValidation.CODE_GENERATE_WAREHOUSE_CODE_MISSING.code,
      );
    });

    it('reads the prefix from code_rule_tbl, not from the hard-coded default', async () => {
      const manager = makeManager(0, true, { [CodeType.ImportForm]: 'NK' });
      await expect(service.generate(manager, CodeType.ImportForm, warehouse, now)).resolves.toBe(
        'NK-WH-HN-01-261122-000001',
      );
      expect(manager.findRule).toHaveBeenCalledWith({ where: { type: CodeType.ImportForm } });
    });

    it('fails when the rule of the type is missing, before touching the counter', async () => {
      const manager = makeManager(0, true, { [CodeType.Item]: null });
      await expectError(
        service.generate(manager, CodeType.Item, warehouse, now),
        CodeGenerateValidation.CODE_RULE_NOT_FOUND.code,
      );
      expect(manager.query).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });
  });

  describe('generate — barcode (EAN-13)', () => {
    it('builds {prefix}{warehouseNo}{seq:7}{check} with a valid check digit', async () => {
      const manager = makeManager(0);

      const barcode = await service.generate(manager, CodeType.Barcode, warehouse, now);

      // 20 001 0000001 + check: 2·1+0·3+0·1+0·3+1·1+0·3+0·1+0·3+0·1+0·3+0·1+1·3 = 6 ⇒ 4.
      expect(barcode).toBe('2000100000014');
      expect(isValidEan13(barcode)).toBe(true);
    });

    it('uses a never-resetting counter (fixed period) per warehouse', async () => {
      const manager = makeManager(41);

      await service.generate(manager, CodeType.Barcode, warehouse, now);

      const where = { type: CodeType.Barcode, warehouseId: 'wh-1', period: '000000' };
      expect(manager.findSequence).toHaveBeenCalledWith(CodeSequence, {
        where,
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.update).toHaveBeenCalledWith(CodeSequence, where, { lastValue: 42 });
    });

    it('uses the prefix of the BARCODE rule', async () => {
      const manager = makeManager(0, true, { [CodeType.Barcode]: '21' });
      const barcode = await service.generate(manager, CodeType.Barcode, warehouse, now);
      expect(barcode.startsWith('21001')).toBe(true);
      expect(isValidEan13(barcode)).toBe(true);
    });

    it('issues consecutive valid barcodes in one call', async () => {
      const codes = await service.generateMany(makeManager(9), CodeType.Barcode, warehouse, 2, now);
      expect(codes.map((c) => c.slice(0, 12))).toEqual(['200010000010', '200010000011']);
      expect(codes.every(isValidEan13)).toBe(true);
    });

    it('fails instead of growing past 13 digits', async () => {
      const manager = makeManager(9999999);
      await expectError(
        service.generate(manager, CodeType.Barcode, warehouse, now),
        CodeGenerateValidation.CODE_GENERATE_BARCODE_EXHAUSTED.code,
      );
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('does not need warehouse.code (only the warehouse number is printed)', async () => {
      const barcode = await service.generate(
        makeManager(0),
        CodeType.Barcode,
        { id: 'wh-1' } as Warehouse,
        now,
      );
      expect(barcode).toBe('2000100000014');
    });
  });

  describe('generate — barcode warehouse number (creation order)', () => {
    it('uses the creation position of the warehouse, zero-padded to 3 digits', async () => {
      const manager = makeManager(0, true, {}, 42);

      const barcode = await service.generate(manager, CodeType.Barcode, warehouse, now);

      expect(barcode.slice(0, 5)).toBe('20042');
      expect(isValidEan13(barcode)).toBe(true);
    });

    it('counts soft-deleted warehouses and compares createdAt in SQL against the warehouse row itself', async () => {
      const manager = makeManager(0);

      await service.generate(manager, CodeType.Barcode, warehouse, now);

      expect(manager.createQueryBuilder).toHaveBeenCalledWith(Warehouse, 'other');
      expect(manager.positionQuery.withDeleted).toHaveBeenCalled();
      expect(manager.positionQuery.innerJoin).toHaveBeenCalledWith(
        Warehouse,
        'self',
        'self.id = :id',
        {
          id: 'wh-1',
        },
      );
      expect(manager.positionQuery.where).toHaveBeenCalledWith(
        expect.stringContaining('other.createdAt < self.createdAt'),
      );
    });

    it('fails past 999 warehouses', async () => {
      const manager = makeManager(0, true, {}, 1000);
      await expectError(
        service.generate(manager, CodeType.Barcode, warehouse, now),
        CodeGenerateValidation.CODE_GENERATE_WAREHOUSE_NO_EXHAUSTED.code,
      );
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('is never computed for text codes (forms, items)', async () => {
      const manager = makeManager(0);
      await service.generate(manager, CodeType.ImportForm, warehouse, now);
      await service.generate(manager, CodeType.ExportForm, warehouse, now);
      await service.generate(manager, CodeType.Item, warehouse, now);
      expect(manager.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('generateMany', () => {
    it('issues consecutive codes with ONE lock and ONE update', async () => {
      const manager = makeManager(7);

      const codes = await service.generateMany(manager, CodeType.Item, warehouse, 3, now);

      expect(codes).toEqual([
        'IT-WH-HN-01-261122-000008',
        'IT-WH-HN-01-261122-000009',
        'IT-WH-HN-01-261122-000010',
      ]);
      expect(manager.findRule).toHaveBeenCalledTimes(1);
      expect(manager.findSequence).toHaveBeenCalledTimes(1);
      expect(manager.update).toHaveBeenCalledTimes(1);
      expect(manager.update).toHaveBeenCalledWith(CodeSequence, expect.anything(), {
        lastValue: 10,
      });
    });

    it.each([0, -1, 1.5])('rejects count %s', async (count) => {
      await expectError(
        service.generateMany(makeManager(0), CodeType.Item, warehouse, count, now),
        CodeGenerateValidation.CODE_GENERATE_COUNT_INVALID.code,
      );
    });
  });
});
