import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { toPaginatedResponse } from './pagination.util';

/** Công thức cũ được chép ở các service trước khi gom (vd `example.service.ts`) — mốc so sánh. */
function legacyPaginate<T>(
  items: T[],
  total: number,
  query: { page: number; size: number },
): AppPaginatedResponseDto<T> {
  const totalPages = Math.ceil(total / query.size);
  return {
    items,
    total,
    page: query.page,
    pageSize: query.size,
    totalPages,
    hasNext: query.page < totalPages,
    hasPrevios: query.page > 1,
  } as AppPaginatedResponseDto<T>;
}

/** Nhánh `IN ()` rỗng cũ của `user.service.ts` (dựng tay `totalPages: 0`, `hasNext: false`). */
function legacyUserEmpty(query: { page: number; size: number }): AppPaginatedResponseDto<never> {
  return {
    items: [],
    total: 0,
    page: query.page,
    pageSize: query.size,
    totalPages: 0,
    hasNext: false,
    hasPrevios: query.page > 1,
  } as AppPaginatedResponseDto<never>;
}

const FIELDS = ['items', 'total', 'page', 'pageSize', 'totalPages', 'hasNext', 'hasPrevios'];

describe('toPaginatedResponse', () => {
  it.each([
    ['total 0, page 1', 0, 1, 10],
    ['total 0, page 3', 0, 3, 10],
    ['size > total', 3, 1, 10],
    ['size === total', 10, 1, 10],
    ['first of many', 25, 1, 10],
    ['middle page', 25, 2, 10],
    ['last page (partial)', 25, 3, 10],
    ['last page (exact)', 30, 3, 10],
    ['page past the end', 25, 5, 10],
    ['size 1', 3, 2, 1],
  ])('matches the legacy formula: %s', (_label, total, page, size) => {
    const items = Array.from({ length: Math.min(size, Math.max(total - (page - 1) * size, 0)) });
    const query = { page, size };

    expect(toPaginatedResponse(items, total, query)).toStrictEqual(
      legacyPaginate(items, total, query),
    );
  });

  it('returns exactly the public fields, including the misspelt `hasPrevios`', () => {
    const result = toPaginatedResponse(['a'], 1, { page: 1, size: 10 });

    expect(Object.keys(result).sort()).toEqual([...FIELDS].sort());
    expect(result).not.toHaveProperty('hasPrevious');
  });

  it('computes values for the last page', () => {
    expect(toPaginatedResponse(['x'], 21, { page: 3, size: 10 })).toStrictEqual({
      items: ['x'],
      total: 21,
      page: 3,
      pageSize: 10,
      totalPages: 3,
      hasNext: false,
      hasPrevios: true,
    });
  });

  it.each([1, 2, 7])('matches the old empty `IN ()` branch of user list (page %i)', (page) => {
    const query = { page, size: 10 };

    expect(toPaginatedResponse([], 0, query)).toStrictEqual(legacyUserEmpty(query));
  });

  it('keeps the same items array reference', () => {
    const items = [{ id: 1 }];

    expect(toPaginatedResponse(items, 1, { page: 1, size: 10 }).items).toBe(items);
  });
});
