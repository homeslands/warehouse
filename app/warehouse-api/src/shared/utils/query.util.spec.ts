import { SortOrder } from 'src/app/base.dto';
import { AppException } from 'src/app/app.exception';
import { AppCommonValidation } from 'src/app/app-common.validation';
import { buildSortOrder } from './query.util';

type Row = { id: string; createdAt: Date; name: string; lastName: string; firstName: string };

enum RowSortBy {
  CreatedAt = 'createdAt',
  Name = 'name',
}

const columns = { name: ['lastName', 'firstName'] } as const;

describe('buildSortOrder', () => {
  it('defaults to createdAt DESC, id ASC', () => {
    expect(buildSortOrder<Row, RowSortBy>({}, { name: ['name'] })).toEqual({
      createdAt: 'DESC',
      id: 'ASC',
    });
  });

  it('maps sortBy to the declared columns in order, all with the same direction', () => {
    const order = buildSortOrder<Row, RowSortBy>(
      { sortBy: RowSortBy.Name, sort: SortOrder.ASC },
      { name: [...columns.name] },
    );

    expect(order).toEqual({ lastName: 'ASC', firstName: 'ASC', id: 'ASC' });
    expect(Object.keys(order)).toEqual(['lastName', 'firstName', 'id']);
  });

  it('always supports createdAt without a column mapping', () => {
    expect(
      buildSortOrder<Row, RowSortBy>(
        { sortBy: RowSortBy.CreatedAt, sort: SortOrder.ASC },
        { name: ['name'] },
      ),
    ).toEqual({
      createdAt: 'ASC',
      id: 'ASC',
    });
  });

  it('throws SORT_BY_INVALID for a field the caller does not declare', () => {
    const call = () =>
      buildSortOrder<Row, RowSortBy>({ sortBy: 'dob' as RowSortBy }, { name: ['name'] });

    expect(call).toThrow(AppException);
    expect(call).toThrow(
      expect.objectContaining({ code: AppCommonValidation.SORT_BY_INVALID.code }),
    );
  });
});
