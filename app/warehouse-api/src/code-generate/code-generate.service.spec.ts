import { EntityManager } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { CodeGenerateService, toCodePeriod } from './code-generate.service';
import { CodeType, DEFAULT_CODE_TYPE_PREFIX } from './code-generate.constants';
import { CodeSequence } from './code-sequence.entity';
import { CodeRule } from './code-rule.entity';
import { CodeGenerateValidation } from './code-generate.validation';
import { isValidEan13 } from './ean13.util';

describe('CodeGenerateService', () => {
  /** `BARCODE_PREFIX` của env; `undefined` = không khai. */
  const makeService = (barcodePrefix?: string) =>
    new CodeGenerateService({ get: jest.fn(() => barcodePrefix) } as unknown as ConfigService);
  const service = makeService();
  const warehouse = { id: 'wh-1', code: 'WH-HN-01', warehouseNo: 1 } as Warehouse;
  // 2026-11-22 09:00 giờ Việt Nam.
  const now = new Date('2026-11-22T02:00:00Z');

  /**
   * `findOne` phục vụ 2 entity: `CodeRule` (tiền tố, mặc định lấy `DEFAULT_CODE_TYPE_PREFIX`, ghi đè
   * qua `prefixes`; `null` = chưa seed) và `CodeSequence` (dòng bộ đếm bị khoá) — tách ra
   * `findRule`/`findSequence` để assert riêng từng lần gọi. `maxQuery.getRawOne` = MAX số kho hiện
   * có (cho `generateWarehouseCode`), mặc định `null` (chưa có kho nào).
   */
  const makeManager = (
    lastValue: number | null,
    isTransactionActive = true,
    prefixes: Partial<Record<CodeType, string | null>> = {},
    maxWarehouseNo: number | string | null = null,
  ) => {
    const maxQuery = {
      withDeleted: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: maxWarehouseNo }),
    };
    const findRule = jest.fn(async ({ where: { type } }: { where: { type: CodeType } }) => {
      const prefix = type in prefixes ? prefixes[type] : DEFAULT_CODE_TYPE_PREFIX[type as never];
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
      createQueryBuilder: jest.fn(() => maxQuery),
      maxQuery,
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

    it('uses the BARCODE_PREFIX env, without reading code_rule_tbl', async () => {
      const manager = makeManager(0);
      const barcode = await makeService('21').generate(manager, CodeType.Barcode, warehouse, now);
      expect(barcode.startsWith('21001')).toBe(true);
      expect(isValidEan13(barcode)).toBe(true);
      expect(manager.findRule).not.toHaveBeenCalled();
    });

    it.each([undefined, '', '  '])('falls back to 20 when BARCODE_PREFIX is %p', async (env) => {
      const barcode = await makeService(env).generate(
        makeManager(0),
        CodeType.Barcode,
        warehouse,
        now,
      );
      expect(barcode.startsWith('20001')).toBe(true);
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
        { id: 'wh-1', warehouseNo: 1 } as Warehouse,
        now,
      );
      expect(barcode).toBe('2000100000014');
    });
  });

  describe('generate — barcode warehouse number', () => {
    it('prints the stored warehouseNo, zero-padded to 3 digits, without querying', async () => {
      const manager = makeManager(0);

      const barcode = await service.generate(
        manager,
        CodeType.Barcode,
        { ...warehouse, warehouseNo: 42 } as Warehouse,
        now,
      );

      expect(barcode.slice(0, 5)).toBe('20042');
      expect(isValidEan13(barcode)).toBe(true);
      expect(manager.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('refuses CodeType.Warehouse through generate (it has no per-warehouse counter)', async () => {
      const manager = makeManager(0);
      await expectError(
        service.generate(manager, CodeType.Warehouse, warehouse, now),
        CodeGenerateValidation.CODE_GENERATE_TYPE_NOT_SUPPORTED.code,
      );
      expect(manager.query).not.toHaveBeenCalled();
    });
  });

  describe('generateWarehouseCode', () => {
    it('issues MAX + 1 as {prefix}-{warehouseNo:3}', async () => {
      const manager = makeManager(null, true, {}, 41);

      await expect(service.generateWarehouseCode(manager)).resolves.toEqual({
        warehouseNo: 42,
        code: 'WH-042',
      });
    });

    it('starts at 001 when there is no warehouse yet', async () => {
      await expect(service.generateWarehouseCode(makeManager(null))).resolves.toEqual({
        warehouseNo: 1,
        code: 'WH-001',
      });
    });

    // MySQL trả MAX(SMALLINT) dạng string ở một số driver ⇒ phải ép số, không thì '41' + 1 = '411'.
    it('handles MAX returned as a string', async () => {
      await expect(
        service.generateWarehouseCode(makeManager(null, true, {}, '41')),
      ).resolves.toMatchObject({ warehouseNo: 42 });
    });

    it('locks the WAREHOUSE rule row FOR UPDATE before reading MAX, counting soft-deleted rows', async () => {
      const manager = makeManager(null);

      await service.generateWarehouseCode(manager);

      expect(manager.findRule).toHaveBeenCalledWith({
        where: { type: CodeType.Warehouse },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.createQueryBuilder).toHaveBeenCalledWith(Warehouse, 'warehouse');
      expect(manager.maxQuery.withDeleted).toHaveBeenCalled();
      expect(manager.findRule.mock.invocationCallOrder[0]).toBeLessThan(
        manager.maxQuery.getRawOne.mock.invocationCallOrder[0],
      );
    });

    it('uses the prefix of the WAREHOUSE rule', async () => {
      const manager = makeManager(null, true, { [CodeType.Warehouse]: 'KH' }, 2);
      await expect(service.generateWarehouseCode(manager)).resolves.toMatchObject({
        code: 'KH-003',
      });
    });

    it('fails past 999 warehouses (barcodes only have 3 digits for it)', async () => {
      await expectError(
        service.generateWarehouseCode(makeManager(null, true, {}, 999)),
        CodeGenerateValidation.CODE_GENERATE_WAREHOUSE_NO_EXHAUSTED.code,
      );
    });

    it('fails when the WAREHOUSE rule is not seeded', async () => {
      await expectError(
        service.generateWarehouseCode(makeManager(null, true, { [CodeType.Warehouse]: null })),
        CodeGenerateValidation.CODE_RULE_NOT_FOUND.code,
      );
    });

    it('refuses to run outside a transaction (the lock would not hold)', async () => {
      const manager = makeManager(null, false);
      await expectError(
        service.generateWarehouseCode(manager),
        CodeGenerateValidation.CODE_GENERATE_TRANSACTION_REQUIRED.code,
      );
      expect(manager.findRule).not.toHaveBeenCalled();
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
