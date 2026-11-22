import { EntityManager } from 'typeorm';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { CodeGenerateService, toCodePeriod } from './code-generate.service';
import { CodeType } from './code-generate.constants';
import { CodeSequence } from './code-sequence.entity';
import { CodeGenerateValidation } from './code-generate.validation';

describe('CodeGenerateService', () => {
  const service = new CodeGenerateService();
  const warehouse = { id: 'wh-1', code: 'WH-HN-01' } as Warehouse;
  // 2026-11-22 09:00 giờ Việt Nam.
  const now = new Date('2026-11-22T02:00:00Z');

  const makeManager = (lastValue: number | null, isTransactionActive = true) => {
    const manager = {
      queryRunner: { isTransactionActive },
      query: jest.fn().mockResolvedValue(undefined),
      findOne: jest
        .fn()
        .mockResolvedValue(lastValue === null ? null : ({ lastValue } as CodeSequence)),
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
      expect(manager.findOne).toHaveBeenCalledWith(CodeSequence, {
        where,
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.update).toHaveBeenCalledWith(CodeSequence, where, { lastValue: 42 });
      const order = [manager.query, manager.findOne, manager.update].map(
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
      expect(manager.findOne).toHaveBeenCalledTimes(1);
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
