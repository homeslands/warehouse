import { EntityManager, QueryFailedError } from 'typeorm';
import { Material } from './material.entity';
import { deleteMaterialSuppliers, insertMaterialSuppliers } from './material-supplier.util';

const duplicate = () =>
  new QueryFailedError('INSERT', [], Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }));

describe('material-supplier.util', () => {
  // `relation(Material, 'suppliers').of(x)` → { add, remove }
  const relationBuilder = { add: jest.fn(), remove: jest.fn() };
  const of = jest.fn(() => relationBuilder);
  const relation = jest.fn(() => ({ of }));
  // Query builder đếm/khoá dòng bảng join của `deleteMaterialSuppliers`.
  const selectBuilder = {
    select: jest.fn(),
    from: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    setLock: jest.fn(),
    getRawMany: jest.fn(),
  };
  const junction = {
    tableName: 'material_supplier_tbl',
    ownerColumns: [{ databaseName: 'material_id_column' }],
    inverseColumns: [{ databaseName: 'supplier_id_column' }],
  };
  const manager = {
    createQueryBuilder: jest.fn(() => ({ relation, ...selectBuilder })),
    connection: {
      getMetadata: jest.fn(() => ({
        findRelationWithPropertyPath: () => ({ junctionEntityMetadata: junction }),
      })),
    },
  } as unknown as EntityManager;

  beforeEach(() => {
    jest.clearAllMocks();
    relationBuilder.add.mockResolvedValue(undefined);
    relationBuilder.remove.mockResolvedValue(undefined);
    for (const key of ['select', 'from', 'where', 'andWhere', 'setLock'] as const)
      selectBuilder[key].mockReturnValue(selectBuilder);
  });

  describe('insertMaterialSuppliers', () => {
    it('does nothing for an empty list', async () => {
      await insertMaterialSuppliers(manager, []);
      expect(relation).not.toHaveBeenCalled();
    });

    it('adds via the Material.suppliers relation, 1 call per material, de-duplicating pairs', async () => {
      await insertMaterialSuppliers(manager, [
        { materialId: 'm-1', supplierId: 's-1' },
        { materialId: 'm-1', supplierId: 's-2' },
        { materialId: 'm-1', supplierId: 's-1' },
        { materialId: 'm-2', supplierId: 's-1' },
      ]);

      expect(relation).toHaveBeenCalledWith(Material, 'suppliers');
      expect(of.mock.calls).toEqual([['m-1'], ['m-2']]);
      expect(relationBuilder.add.mock.calls).toEqual([[['s-1', 's-2']], [['s-1']]]);
    });

    // Thay cho `INSERT IGNORE` cũ: cặp đã có (gắn chen đồng thời) không làm hỏng request.
    it('on ER_DUP_ENTRY retries pair by pair and skips pairs that already exist', async () => {
      relationBuilder.add
        .mockRejectedValueOnce(duplicate()) // cả lô
        .mockRejectedValueOnce(duplicate()) // s-1 đã có
        .mockResolvedValueOnce(undefined); // s-2 gắn được

      await expect(
        insertMaterialSuppliers(manager, [
          { materialId: 'm-1', supplierId: 's-1' },
          { materialId: 'm-1', supplierId: 's-2' },
        ]),
      ).resolves.toBeUndefined();

      expect(relationBuilder.add.mock.calls).toEqual([[['s-1', 's-2']], ['s-1'], ['s-2']]);
    });

    it('rethrows any other error', async () => {
      relationBuilder.add.mockRejectedValueOnce(new Error('ER_NO_REFERENCED_ROW'));

      await expect(
        insertMaterialSuppliers(manager, [{ materialId: 'm-1', supplierId: 's-1' }]),
      ).rejects.toThrow('ER_NO_REFERENCED_ROW');
      expect(relationBuilder.add).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteMaterialSuppliers', () => {
    it.each([
      [[], ['s-1']],
      [['m-1'], []],
    ])(
      'returns 0 without touching the DB for empty ids (%p, %p)',
      async (materialIds, supplierIds) => {
        await expect(deleteMaterialSuppliers(manager, materialIds, supplierIds)).resolves.toBe(0);
        expect(manager.createQueryBuilder).not.toHaveBeenCalled();
      },
    );

    it('locks the attached pairs (join table only), removes via the relation, returns the count', async () => {
      selectBuilder.getRawMany.mockResolvedValue([{}, {}]);

      await expect(deleteMaterialSuppliers(manager, ['m-1', 'm-2'], ['s-1'])).resolves.toBe(2);

      expect(selectBuilder.from).toHaveBeenCalledWith('material_supplier_tbl', 'ms');
      expect(selectBuilder.where).toHaveBeenCalledWith(
        'ms.material_id_column IN (:...materialIds)',
        {
          materialIds: ['m-1', 'm-2'],
        },
      );
      expect(selectBuilder.andWhere).toHaveBeenCalledWith(
        'ms.supplier_id_column IN (:...supplierIds)',
        { supplierIds: ['s-1'] },
      );
      expect(selectBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
      expect(relation).toHaveBeenCalledWith(Material, 'suppliers');
      expect(of).toHaveBeenCalledWith(['m-1', 'm-2']);
      expect(relationBuilder.remove).toHaveBeenCalledWith(['s-1']);
      // Đếm (và khoá) TRƯỚC khi xoá.
      expect(selectBuilder.getRawMany.mock.invocationCallOrder[0]).toBeLessThan(
        relationBuilder.remove.mock.invocationCallOrder[0],
      );
    });

    it('skips the remove when no pair is attached', async () => {
      selectBuilder.getRawMany.mockResolvedValue([]);

      await expect(deleteMaterialSuppliers(manager, ['m-1'], ['s-1'])).resolves.toBe(0);
      expect(relationBuilder.remove).not.toHaveBeenCalled();
    });
  });
});
